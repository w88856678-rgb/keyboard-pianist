import { writeFile } from "node:fs/promises";

// Refresh public file metadata only. Never download or bundle score contents.
const repository = "Flame-shi/musical-notation";
async function github(path) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    const detail = await response.text();
    const reason = detail.includes("rate limit exceeded") ? "GitHub 公共 API 额度已用完，请稍后重试" : `GitHub 请求失败 (${response.status})`;
    throw new Error(`${reason}，保留原目录。`);
  }
  return response.json();
}
try {
const repo = await github("");
const tree = await github(`/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`);
if (tree.truncated) throw new Error("GitHub 返回的目录不完整，保留原目录。");
const entries = tree.tree.filter((item) => item.type === "blob" && /\.(png|jpe?g|gif|webp|pdf|midi?|mxl|musicxml|xml)$/i.test(item.path)).map(({ path, sha }) => ({ path, sha }));
if (!entries.length) throw new Error("没有找到乐谱文件，保留原目录。");
const data = { repository, branch: repo.default_branch, revision: tree.sha, updatedAt: new Date().toISOString().slice(0, 10), entries };
await writeFile(new URL("../src/data/score-catalog.json", import.meta.url), `${JSON.stringify(data, null, 2)}\n`);
console.log(`已更新 ${entries.length} 份乐谱的名称与来源链接。`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
