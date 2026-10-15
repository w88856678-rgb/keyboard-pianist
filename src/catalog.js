import { pinyin } from "pinyin-pro";
import data from "./data/score-catalog.json";
import mainstreamSongs from "./data/mainstream.js";
const artists = Object.fromEntries(mainstreamSongs.map(song => [song.sourcePath, song.artist]));

export const CATALOG_SOURCE = {
  name: data.repository,
  url: `https://github.com/${data.repository}`,
  updatedAt: data.updatedAt,
};
const normalize = (value) =>
  String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
function searchTerms(value) {
  const words = pinyin(String(value || ""), { toneType: "none", type: "array" });
  return [normalize(value), normalize(words.join("")), normalize(words.map((w) => w[0]).join(""))];
}
export const SCORE_CATALOG = data.entries.map(({ path, sha }) => {
  const filename = path.split("/").at(-1);
  const title = filename.replace(/\.[^.]+$/, "");
  const artist = ({ ...artists, "演员.png": "薛之谦", "成都.jpg": "赵雷" })[path] || "";
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "简谱";
  return {
    id: `github:${path}`,
    title,
    artist,
    path,
    sha,
    folder,
    format: filename.split(".").at(-1).toUpperCase(),
    url: `https://github.com/${data.repository}/blob/${data.branch}/${path.split("/").map(encodeURIComponent).join("/")}`,
    searchTerms: [title, artist, folder].flatMap(searchTerms),
  };
}).sort((a, b) => Number(b.title === "演员") - Number(a.title === "演员") || a.title.localeCompare(b.title, "zh-CN"));

export function searchCatalog(items, query) {
  const tokens = String(query).trim().split(/\s+/).map(normalize).filter(Boolean);
  return items.filter((item) => {
    const terms = item.searchTerms || [item.title, item.artist, item.tag].flatMap(searchTerms);
    return tokens.every((token) => terms.some((term) => term.includes(token)));
  });
}
