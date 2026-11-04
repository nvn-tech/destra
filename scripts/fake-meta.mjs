// Local development: a fake Meta Graph API and login dialog on port 4100.
// Start it, then run the API with META_GRAPH_URL and META_DIALOG_URL set to http://127.0.0.1:4100.
import { createServer } from "node:http";
import { FakeGraph } from "../packages/meta/dist/testing/fake-graph.js";

const graph = new FakeGraph();
graph.dialogCode = "code-demo";
graph.addUser({
  id: "fb-demo",
  name: "Dra. Ana Souza",
  code: "code-demo",
  pages: [
    {
      id: "page-demo",
      name: "Dra. Ana Souza — Endocrinologia",
      access_token: "page-token-demo",
      tasks: ["MANAGE"],
      instagram_business_account: {
        id: "ig-demo",
        username: "dra.anasouza",
        name: "Dra. Ana Souza",
        followers_count: 12400,
        media_count: 214,
      },
    },
  ],
});
graph.addAccount("ig-demo", {
  followers: 12400,
  media: Array.from({ length: 24 }, (_, i) => ({
    id: `demo-${i}`,
    media_type: "CAROUSEL_ALBUM",
    caption: `Post ${i} #tireoide`,
    timestamp: new Date(Date.now() - i * 2 * 86400000).toISOString(),
    like_count: 300 + i * 7,
    comments_count: 12,
  })),
  insights: { "demo-0": { views: 5400, reach: 4100, saved: 230, shares: 41 } },
});
graph.addDiscoverable("dra.referencia", {
  id: "ig-ref-demo",
  username: "dra.referencia",
  name: "Dra. Referência (fictícia)",
  followers_count: 184000,
  media_count: 412,
  media: { data: [] },
});

const url = await graph.start();
// Re-expose on a fixed port for convenience.
createServer((req, res) =>
  fetch(url + req.url, { redirect: "manual" }).then(async (r) => {
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  }),
).listen(4100, "127.0.0.1", () => console.log("Fake Meta on http://127.0.0.1:4100"));
