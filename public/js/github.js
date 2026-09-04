const GitHubStore = {
  repo: "iamsacso/craftland-assets",
  branch: "main",

  async request(token, path, options = {}) {
    const res = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub error ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  },

  async verify(token) {
    const repo = await this.request(token, `/repos/${this.repo}`);
    if (repo.permissions && repo.permissions.push === false) {
      throw new Error("This GitHub token cannot upload to the repo.");
    }
    return true;
  },

  async readAssets(token) {
    const file = await this.request(
      token,
      `/repos/${this.repo}/contents/docs/data/assets.json?ref=${this.branch}`
    );
    const json = decodeUtf8Base64(file.content);
    const data = JSON.parse(json);
    return Array.isArray(data) ? data : [];
  },

  async commitFiles(token, message, files) {
    const ref = await this.request(
      token,
      `/repos/${this.repo}/git/ref/heads/${this.branch}`
    );
    const commitSha = ref.object.sha;
    const commit = await this.request(
      token,
      `/repos/${this.repo}/git/commits/${commitSha}`
    );

    const treeItems = [];
    for (const file of files) {
      if (file.delete) {
        treeItems.push({
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: null,
        });
        continue;
      }
      const blob = await this.request(token, `/repos/${this.repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content: file.base64,
          encoding: "base64",
        }),
      });
      treeItems.push({
        path: file.path,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      });
    }

    const tree = await this.request(token, `/repos/${this.repo}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: commit.tree.sha,
        tree: treeItems,
      }),
    });

    const next = await this.request(token, `/repos/${this.repo}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [commitSha],
      }),
    });

    await this.request(token, `/repos/${this.repo}/git/refs/heads/${this.branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: next.sha }),
    });
  },
};

function decodeUtf8Base64(b64) {
  const binary = atob(String(b64).replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function randomName(originalName) {
  const ext = originalName.includes(".")
    ? originalName.slice(originalName.lastIndexOf(".")).toLowerCase()
    : "";
  const rand = Math.random().toString(16).slice(2, 10);
  return `${Date.now()}-${rand}${ext}`;
}
