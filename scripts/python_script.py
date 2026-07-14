import requests
import json
import base64
import time

headers = {"Authorization": "token REDACTED_TOKEN"}
url = "https://api.github.com/search/repositories"

all_repos = []
for page in range(1, 6):
    params = {
        "q": "language:python stars:>500",
        "sort": "stars",
        "per_page": 100,
        "page": page
    }
    response = requests.get(url, headers=headers, params=params)
    all_repos.extend(response.json()["items"])

print(len(all_repos))

for repo in all_repos:
    readme_url = f"https://api.github.com/repos/{repo['full_name']}/readme"
    r = requests.get(readme_url, headers=headers)
    if r.status_code == 200:
        content = base64.b64decode(r.json()["content"]).decode("utf-8", errors="ignore")
        repo["readme"] = content
    else:
        repo["readme"] = ""
    time.sleep(0.5)

with open("repos.json", "w") as f:
    json.dump(all_repos, f)