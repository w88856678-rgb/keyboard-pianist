import { describe, expect, it } from "vitest";
import { SCORE_CATALOG, searchCatalog } from "./catalog";

describe("score discovery", () => {
  it("finds the same score by title, spaced pinyin, initials and artist", () => {
    for (const query of ["演员", "yanyuan", "yan yuan", "yy", "薛之谦 演员", "ＹＡＮＹＵＡＮ"]) {
      expect(searchCatalog(SCORE_CATALOG, query).some((s) => s.path === "演员.png")).toBe(true);
    }
  });
  it("searches imported songs too, and keeps online results as source links without playable notes", () => {
    const ownSong = { id: "own", title: "我的春天", artist: "自己", events: [] };
    expect(searchCatalog([ownSong], "wdct")).toEqual([ownSong]);
    expect(searchCatalog(SCORE_CATALOG, "a nonexistent score")).toEqual([]);
    expect(searchCatalog(SCORE_CATALOG, " ")).toHaveLength(SCORE_CATALOG.length);
    const actor = searchCatalog(SCORE_CATALOG, "演员")[0];
    expect(actor.url).toBe("https://github.com/Flame-shi/musical-notation/blob/master/%E6%BC%94%E5%91%98.png");
    expect(actor.events).toBeUndefined();
  });
});
