#!/usr/bin/env python3
"""A fake Social Champ MCP server over stdio, for README screenshots only.

Serves a made-up brand (Harbor Cafe, Northwind Bakery) whose posts sit around today's
date. Writes change the in-memory data so before/after screens are consistent.
No network, no real account.
"""
import json
import sys
from datetime import datetime, timedelta, timezone

NOW = datetime.now().astimezone()
MON = (NOW - timedelta(days=NOW.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)


def at(day_offset, hour, minute=0):
    """A time on the current week: 0 = Monday."""
    return (MON + timedelta(days=day_offset, hours=hour, minutes=minute)).astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


WORKSPACES = [
    {'id': 'w1', 'name': 'Harbor Cafe', 'profilesCount': 4},
    {'id': 'w2', 'name': 'Northwind Bakery', 'profilesCount': 2},
]
CHANNELS = [
    {'id': 'c1', 'name': 'Harbor Cafe', 'type': 'FB_PAGE', 'workspaceId': 'w1'},
    {'id': 'c2', 'name': 'harborcafe', 'type': 'IG_BUSINESS', 'workspaceId': 'w1'},
    {'id': 'c3', 'name': 'Harbor Cafe', 'type': 'IN_PAGE', 'workspaceId': 'w1'},
    {'id': 'c4', 'name': '@harborcafe', 'type': 'TW', 'workspaceId': 'w1'},
    {'id': 'c5', 'name': 'Northwind Bakery', 'type': 'FB_PAGE', 'workspaceId': 'w2'},
    {'id': 'c6', 'name': 'northwindbakery', 'type': 'IG_BUSINESS', 'workspaceId': 'w2'},
]
LABELS = [{'id': 'l1', 'title': 'menu'}, {'id': 'l2', 'title': 'events'}, {'id': 'l3', 'title': 'promo'}]


def post(pid, ch, text, when, **extra):
    channel = next(c for c in CHANNELS if c['id'] == ch)
    p = {'id': pid, 'channelId': ch, 'text': text, 'dateTime': when, 'socialType': channel['type'],
         'sourceType': 'MANUAL', 'labelIds': [], 'channel': {'name': channel['name']}}
    p.update(extra)
    return p


POSTS = [
    post('p1', 'c1', 'New autumn menu is here: pumpkin spice latte, apple crumble and a cinnamon bun that will ruin all other buns for you.', at(0, 9), isPosted=True, permalinkUrl='https://example.com/p1', labelIds=['l1']),
    post('p2', 'c2', 'Latte art Monday ☕ Tag us in your best cup this week.', at(0, 12, 30), isPosted=True, permalinkUrl='https://example.com/p2'),
    post('p3', 'c3', "We're hiring a weekend barista. Flexible hours, free coffee, good music.", at(1, 10), isPosted=True, permalinkUrl='https://example.com/p3'),
    post('p4', 'c4', 'Rainy day = soup day. Tomato & basil until it runs out.', at(1, 13), isPosted=True, permalinkUrl='https://example.com/p4'),
    post('p5', 'c2', 'Behind the bar: how we roast our house blend, start to finish.', at(2, 18), hasError=True, error='Instagram rejected the video: aspect ratio must be between 4:5 and 1.91:1.'),
    post('p6', 'c1', 'Thursday live music: The Driftwood Trio from 7pm. No cover charge.', at(3, 11), isPosted=True, permalinkUrl='https://example.com/p6', labelIds=['l2']),
    post('p7', 'c3', 'Meet Maya, our head baker, and the 4am routine behind every croissant.', at(4, 9, 30), isPosted=True, permalinkUrl='https://example.com/p7'),
    post('p8', 'c1', 'Weekend brunch: bottomless coffee with any plate, 9 to 2.', at(5, 8), labelIds=['l3']),
    post('p9', 'c2', 'Saturday market stall 🍎 Find us by the fountain with fresh bread and cold brew.', at(5, 10)),
    post('p10', 'c4', 'Quiet corner, fast wifi, endless refills. Your new Saturday office?', at(5, 15)),
    post('p11', 'c1', 'Sunday roast is back. Book a table before noon.', at(6, 11), approvalStatus='PENDING'),
    post('p12', 'c2', 'Sunday slow mornings. What are you reading this week?', at(6, 10)),
    post('p13', 'c3', 'Our autumn hours: 7am to 6pm every day, 8am on Sundays.', at(7, 9)),
    post('p14', 'c1', 'Two-for-one cookies every Monday after 3pm.', at(7, 15), labelIds=['l3']),
    post('p15', 'c2', 'New mugs in the shop, handmade by a local potter.', at(8, 12)),
    post('p16', 'c4', 'Pumpkin spice is back and we have no regrets.', at(9, 8)),
    post('p17', 'c5', 'Sourdough loaves out of the oven at 7am sharp.', at(5, 7)),
    post('p18', 'c6', 'Rye, spelt or classic? Vote in our story.', at(6, 9)),
]
DRAFTS = [
    {'_id': 'd1', 'posts': {'ALL': {'post': 'Halloween week: spooky cupcakes and a costume discount. Need a photo of the window display.'}}, 'dateTime': at(16, 10), 'createdBy': 'Maya'},
    {'_id': 'd2', 'posts': {'ALL': {'post': 'Customer of the month feature: ask Jon for permission first.'}}, 'createdBy': 'Jon'},
    {'_id': 'd3', 'posts': {'ALL': {'post': 'Winter menu teaser (do not post before November).'}}, 'createdBy': 'Maya'},
]
SHARES = [{'_id': 's1', 'name': 'October plan for the owners', 'isActive': True, 'link': 'https://publish.socialchamp.com/app/client/calendar?id=demo'}]
COLLECTIONS = [{'id': 'k1', 'title': 'Evergreen', 'postCount': 12, 'workspaceId': 'w1'}]


def in_range(when, args):
    lo, hi = args.get('fromDate'), args.get('toDate')
    return (lo is None or when >= lo) and (hi is None or when <= hi)


def status(p):
    return 'FAILED' if p.get('hasError') else 'PUBLISHED' if p.get('isPosted') else 'HELD' if p.get('approvalStatus') == 'PENDING' else 'SCHEDULED'


def local_day(iso):
    return datetime.fromisoformat(iso.replace('Z', '+00:00')).astimezone().strftime('%Y-%m-%d')


def summary(args):
    counts = {}
    # Fill the rest of the month with a light, believable rhythm.
    extra = []
    first = NOW.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    for d in range(0, 31):
        day = first + timedelta(days=d)
        if day.month != first.month:
            break
        if MON <= day < MON + timedelta(days=10):
            continue
        n = [2, 1, 3, 0, 2, 4, 1][day.weekday()]
        if n:
            extra.append((day.strftime('%Y-%m-%d'), 'c1', 'PUBLISHED' if day < NOW else 'SCHEDULED', n))
    for p in POSTS:
        if in_range(p['dateTime'], args):
            key = (local_day(p['dateTime']), p['channelId'], status(p))
            counts[key] = counts.get(key, 0) + 1
    rows = [{'day': k[0], 'channelId': k[1], 'status': k[2], 'count': v} for k, v in counts.items()]
    rows += [{'day': d, 'channelId': c, 'status': s, 'count': n} for d, c, s, n in extra
             if in_range(d + 'T12:00:00Z', args)]
    return {'counts': rows}


def slots():
    days = [{'type': t, 'slots': [s + 'T09:00:00.000Z' for s in ['2026-01-05']] + ['2026-01-05T17:00:00.000Z']}
            for t in ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']]
    return {'timetable': {'timezoneName': str(NOW.tzinfo) if '/' in str(NOW.tzinfo) else 'UTC', 'days': days}}


def call(name, args):
    if name == 'get_workspaces':
        return {'items': WORKSPACES}
    if name in ('get_channels', 'get_filtered_channels'):
        return {'items': CHANNELS}
    if name == 'get_paginated_posts':
        items = [p for p in POSTS if in_range(p['dateTime'], args)]
        return {'posts': items, 'pagination': {'page': 1, 'totalPages': 1}}
    if name == 'get_posts_for_channels':
        return {'items': [p for p in POSTS if p['channelId'] in (args.get('channelIds') or [])]}
    if name == 'approval_list_pending':
        return {'items': [{'_id': p['id'], 'post': p['text']} for p in POSTS if p.get('approvalStatus') == 'PENDING']}
    if name == 'label_list':
        return {'labels': LABELS}
    if name == 'get_calendar_events':
        return {'events': []}
    if name == 'get_calendar_summary':
        return summary(args)
    if name == 'get_drafts':
        return {'items': DRAFTS}
    if name == 'get_queue_slots':
        return slots()
    if name == 'get_shareable_calendars':
        return {'items': SHARES}
    if name == 'list_collections':
        return {'collections': COLLECTIONS}
    if name == 'generate_post':
        return {'text': 'Cold brew season is over, hot chocolate season has begun. Come in from the rain, we saved you a seat by the window. ☕🍫'}
    if name == 'rewrite':
        return {'text': 'Hot chocolate season has begun. Your window seat is waiting. ☕🍫'}
    if name == 'suggest_hashtags':
        return {'hashtags': ['hotchocolate', 'cafelife', 'autumn']}
    if name == 'update_post':
        for p in POSTS:
            if p['id'] == args.get('postId'):
                for k in ('dateTime', 'text'):
                    if k in args:
                        p[k] = args[k]
                p.pop('hasError', None)
        return {'ok': True}
    return {'ok': True}


TOOLS = ['get_workspaces', 'get_channels', 'get_filtered_channels', 'get_paginated_posts', 'get_posts_for_channels',
         'approval_list_pending', 'label_list', 'get_calendar_events', 'get_calendar_summary', 'get_drafts',
         'get_queue_slots', 'get_shareable_calendars', 'list_collections', 'generate_post', 'rewrite',
         'suggest_hashtags', 'update_post', 'queue_reorder', 'label_apply', 'label_remove', 'create_text_post']


def reply(rid, result):
    sys.stdout.write(json.dumps({'jsonrpc': '2.0', 'id': rid, 'result': result}) + '\n')
    sys.stdout.flush()


for line in sys.stdin:
    try:
        msg = json.loads(line)
    except ValueError:
        continue
    rid, method = msg.get('id'), msg.get('method')
    if rid is None:
        continue
    if method == 'initialize':
        reply(rid, {'protocolVersion': msg.get('params', {}).get('protocolVersion', '2025-06-18'),
                    'capabilities': {'tools': {}}, 'serverInfo': {'name': 'demo-socialchamp', 'version': '1.0'}})
    elif method == 'tools/list':
        reply(rid, {'tools': [{'name': t, 'description': f'Demo {t}', 'inputSchema': {'type': 'object'}} for t in TOOLS]})
    elif method == 'tools/call':
        p = msg.get('params', {})
        out = call(p.get('name'), p.get('arguments') or {})
        reply(rid, {'content': [{'type': 'text', 'text': json.dumps(out)}], 'isError': False})
    else:
        reply(rid, {})
