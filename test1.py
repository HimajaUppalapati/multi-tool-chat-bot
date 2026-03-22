import requests
import json
import asyncio

# Tool Selection Guide:
# - math_tool: Use for mathematical calculations, equations, simplifications (e.g., "2^3 + 4", "solve x^2 = 4")
# - internet_search_tool: Use for general web searches, news, facts, definitions, current events (e.g., "latest AI news", "what is quantum computing")
# - reddit_tool: Use for community discussions, opinions, user experiences, niche topics (e.g., "best machine learning resources", "experiences with remote work")
# - chemistry_tool: Use for chemical compound information, CAS numbers, synonyms (e.g., "water chemical info", "aspirin properties")

async def call_llm(prompt):
    token = "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"
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }
    data = {
        "model": "meta-llama/llama-3-8b-instruct",
        "messages": [{"role": "user", "content": prompt}]
    }
    response = await asyncio.to_thread(requests.post, url, headers=headers, json=data)
    if response.status_code == 200:
        return response.json()["choices"][0]["message"]["content"].strip()
    else:
        raise Exception(f"LLM error: {response.status_code} {response.text}")

def math_tool(query):
    url = f"https://newton.vercel.app/api/v2/simplify/{query.replace(' ', '%20')}"
    response = requests.get(url)
    if response.status_code != 200:
        raise Exception(f"Math API error: {response.status_code}")
    data = response.json()
    return data.get('result', 'No result')

def internet_search_tool(query):
    query = query.strip()
    # Add DuckDuckGo bangs for quick, targeted searches
    query_lower = query.lower()
    if 'wikipedia' in query_lower or 'wiki' in query_lower:
        query = '!w ' + query
    elif 'news' in query_lower:
        query = '!news ' + query
    elif 'images' in query_lower or 'pics' in query_lower:
        query = '!i ' + query
    elif 'videos' in query_lower:
        query = '!v ' + query
    # Add more bangs as needed for other quick searches
    url = f"https://api.duckduckgo.com/?q={query}&format=json&no_redirect=1&no_html=1"
    response = requests.get(url, headers={"User-Agent": "multi-tool-chat-bot/1.0"})
    if response.status_code not in [200, 202]:
        raise Exception(f"DuckDuckGo search error: {response.status_code} - {response.text}")
    data = response.json()
    result = ''
    if data.get('AbstractText'):
        result += f"Summary: {data['AbstractText']}\n"
    if data.get('AbstractURL'):
        result += f"Source: {data['AbstractURL']}\n"
    if data.get('RelatedTopics'):
        result += '\nRelated Topics:\n'
        for topic in data['RelatedTopics'][:5]:
            if topic.get('Text'):
                result += f"- {topic['Text']}\n"
    return result or 'No results found.'

async def fetch_reddit_thread(permalink):
    url = f"{permalink.rstrip('/')}.json"
    response = await asyncio.to_thread(requests.get, url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'})
    if response.status_code != 200:
        raise Exception("Reddit fetch failed")
    return response.json()

async def select_subreddits(query):
    # Preprocess query for subreddit search: remove stop words and take key terms
    stop_words = {'get', 'me', 'the', 'latest', 'in', 'a', 'an', 'and', 'or', 'but', 'if', 'while', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once'}
    key_terms = [word for word in query.lower().split() if word not in stop_words]
    subreddit_query = ' '.join(key_terms[:5])  # take up to 5 key terms
    url = f"https://www.reddit.com/subreddits/search.json?q={subreddit_query.replace(' ', '%20')}&limit=10"
    response = await asyncio.to_thread(requests.get, url, headers={'User-Agent': 'multi-tool-chat-bot/1.0'})
    if response.status_code != 200:
        return []
    try:
        data = response.json()
        children = data['data']['children']
        subs = [
            child['data']['display_name']
            for child in children
            if isinstance(child, dict) and 'data' in child and isinstance(child['data'], dict) and child['data'].get('subscribers', 0) > 10000 and not child['data'].get('over18', False)
        ]
        # Now search in these subs
        all_posts = []
        for sub in subs[:3]:
            try:
                posts = await search_subreddit(sub, query)
                all_posts.extend(posts)
            except:
                pass
        # Sort by score and take top 5
        top_posts = sorted(all_posts, key=lambda p: p['score'], reverse=True)[:5]
        # Fetch details and summarize
        summaries = []
        for post in top_posts:
            try:
                thread_data = await fetch_reddit_thread(post['url'])
                if not isinstance(thread_data, list) or len(thread_data) < 2:
                    continue
                post_data = thread_data[0]['data']['children'][0]['data']
                comments = ' '.join([c['data']['body'] for c in thread_data[1]['data']['children'][:5] if isinstance(c, dict) and 'data' in c and 'body' in c['data']])[:500]
                content = f"{post_data['title']} {post_data.get('selftext', '')} {comments}"
                # Summarize relevant to query
                summary_prompt = f"Summarize the parts of this Reddit post and comments that are relevant to the query '{query}'. If nothing is relevant, say 'Not relevant'. Keep it concise: {content}"
                summary = await call_llm(summary_prompt)
                if summary.strip() != 'Not relevant':
                    summaries.append(f"Post: {post['title']} - {summary.strip()}")
            except Exception as e:
                pass
        return '\n\n'.join(summaries) if summaries else 'No relevant posts found.'
    except:
        return 'No relevant posts found.'

async def search_subreddit(subreddit, query):
    url = f'https://www.reddit.com/r/{subreddit}/search.json?q={query.replace(" ", "%20")}&restrict_sr=1&sort=relevance&limit=100'
    response = await asyncio.to_thread(requests.get, url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'})
    if response.status_code != 200:
        return []
    data = response.json()
    return [{'title': p['data']['title'], 'url': f"https://reddit.com{p['data']['permalink']}", 'score': p['data']['score'], 'created': p['data']['created_utc'], 'subreddit': p['data']['subreddit'], 'author': p['data']['author']} for p in data['data']['children']]
async def reddit_tool(query):
    return await select_subreddits(query)

def chemistry_tool(query):
    url = f"https://commonchemistry.cas.org/api/search?q={query.replace(' ', '%20')}"
    response = requests.get(url)
    if response.status_code != 200:
        raise Exception(f"Chemistry API error: {response.status_code}")
    data = response.json()
    return data.get('results', [])[:5]

async def test_tools():
    print("Starting tests...")
    # print("Testing Math Tool:")
    # try:
    #     result = math_tool("2^3 + 4")
    #     print(f"Result: {result}")
    # except Exception as e:
    #     print(f"Error: {e}")

    print("\nTesting Internet Search Tool:")
    try:
        result = internet_search_tool(" AI news")
        print(f"Result:\n{result}")
    except Exception as e:
        print(f"Error: {e}")

    print("\nTesting Reddit Tool:")
    try:
        result = await reddit_tool("get me latest weather in bangalore")
        print(f"Result:\n{result}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_tools())