#!/usr/bin/env python3
"""Check external and local endpoints used by the project.
Usage: python scripts/check_urls.py
"""
import json
import os
import sys
import urllib.request
import urllib.error

DEFAULT_TIMEOUT = 10

urls = [
    {"name": "Pollinations (text API)", "url": "https://text.pollinations.ai/", "method": "POST", "body": {"messages": [{"role": "user", "content": "ping"}] }},
    # Replace HuggingFace inference (requires auth / gone) with EaseMate free chat UI
    {"name": "EaseMate Free Chat", "url": "https://www.easemate.ai/chatgpt-free", "method": "GET"},
    {"name": "MathJS", "url": "https://api.mathjs.org/v4/?expr=2%2B2", "method": "GET"},
    {"name": "Google News RSS", "url": "https://news.google.com/rss/search?q=test", "method": "GET"},
    {"name": "Rhea DB (chemistry)", "url": "https://www.rhea-db.org/rhea/?query=water&columns=rhea-id,equation&format=tsv&limit=1", "method": "GET"},
    {"name": "AskSia solver", "url": "https://www.asksia.ai/solver", "method": "GET"},
    {"name": "AI Homework Helper", "url": "https://aihomeworkhelper.org/", "method": "GET"},
    {"name": "PDF24", "url": "https://pdf24.org/", "method": "GET"},
    {"name": "SmallPDF", "url": "https://smallpdf.com/", "method": "GET"},
    {"name": "Google Docs", "url": "https://docs.google.com/", "method": "GET"},
    {"name": "OneCompiler", "url": "https://onecompiler.com/", "method": "GET"},
    {"name": "JDoodle", "url": "https://www.jdoodle.com/", "method": "GET"},
    {"name": "CodeChef IDE", "url": "https://www.codechef.com/ide", "method": "GET"},
    {"name": "DuckDuckGo", "url": "https://duckduckgo.com/", "method": "GET"},
    # Perplexity blocked for script requests — replace with TalkAI free chat
    {"name": "TalkAI (free chat)", "url": "https://talkai.info/", "method": "GET"},
    {"name": "Local backend /answer", "url": "http://localhost:4000/answer", "method": "POST", "body": {"input": "ping", "tools_choosen": ["math_tool"]}},
]

gpt_oss = os.environ.get('GPT_OSS_URL')
if gpt_oss:
    urls.insert(0, {"name": "GPT_OSS (env GPT_OSS_URL)", "url": gpt_oss, "method": "POST", "body": {"messages": [{"role": "user", "content": "ping"}]}})


def check_entry(entry):
    url = entry['url']
    method = entry.get('method', 'GET').upper()
    body = entry.get('body')
    headers = {}
    data = None
    if body and method in ('POST', 'PUT', 'PATCH'):
        data = json.dumps(body).encode('utf-8')
        headers['Content-Type'] = 'application/json'

    req = urllib.request.Request(url, data=data, method=method)
    for k, v in headers.items():
        req.add_header(k, v)

    try:
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
            status = resp.getcode()
            return True, status, None
    except urllib.error.HTTPError as e:
        return False, e.code, str(e)
    except Exception as e:
        return False, None, str(e)


def main():
    results = []
    for entry in urls:
        ok, status, error = check_entry(entry)
        results.append({'name': entry['name'], 'url': entry['url'], 'ok': ok, 'status': status, 'error': error})
        tag = 'OK  ' if ok else 'FAIL'
        print(f"{tag} | {entry['name']} | {entry['url']} | status={status or '-'} {('| error=' + error) if error else ''}")

    failed = [r for r in results if not r['ok']]
    print('\nSummary:')
    print(f"Total checked: {len(results)}")
    print(f"Failed: {len(failed)}")
    if failed:
        print('\nFailed endpoints:')
        for f in failed:
            print(f"- {f['name']} -> {f['url']} | status={f['status'] or '-'} | error={f['error'] or '-'}")
        sys.exit(2)
    else:
        print('All endpoints responded OK (2xx/3xx).')


if __name__ == '__main__':
    main()
