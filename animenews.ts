/// <reference path="./plugin.d.ts" />

function init() {
    $ui.register((ctx) => {
        const tray = ctx.newTray({
            tooltipText: "Anime News",
            iconUrl: "https://raw.githubusercontent.com/SyntaxSama/aninewsnet-seanime/refs/heads/main/animenewsnetwork.png",
            withContent: true,
        });

        const pageState = ctx.state<"list" | "article">("list");
        const newsItems = ctx.state<
            Array<{ title: string; link: string; description: string }>
        >([]);
        const currentArticle = ctx.state<{ title: string; content: string } | null>(
            null
        );
        const currentPage = ctx.state(0);
        const ITEMS_PER_PAGE = 10;

        async function fetchNews() {
            try {
                const res = await ctx.fetch(
                    "https://www.animenewsnetwork.com/all/rss.xml"
                );
                const txt = await res.text();

                const items: Array<{ title: string; link: string; description: string }> =
                    [];
                const itemMatches = [...txt.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(
                    0,
                    50
                );
                for (const m of itemMatches) {
                    const block = m[1];
                    const title = (block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ||
                        "No title"
                    )
                        .replace(/<!\[CDATA\[|\]\]>/g, "")
                        .trim();
                    const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "#").trim();
                    const description = (block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ||
                        ""
                    )
                        .replace(/<!\[CDATA\[|\]\]>/g, "")
                        .trim();
                    items.push({ title, link, description });
                }

                newsItems.set(items);
            } catch (err) {
                console.error("[tray-news-plugin]", err);
                newsItems.set([]);
            }
        }

        async function fetchFullArticle(url: string) {
            try {
                const res = await ctx.fetch(url);
                const html = await res.text();
                const konaMatch = html.match(/<div class="KonaBody">([\s\S]*?)<\/div>\s*<\/div>/i);
                if (!konaMatch) return "Full content unavailable.";

                const konaHTML = konaMatch[1];

                const pMatches = [...konaHTML.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
                const paragraphs: string[] = [];

                for (const m of pMatches) {
                    let text = m[1];
                    text = text.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1");
                    text = text.replace(/<[^>]+>/g, "");
                    text = text.replace(/\s+/g, " ").trim();
                    if (text) paragraphs.push(text);
                }

                if (!paragraphs.length) return "No readable content found.";

                return paragraphs.join("\n\n");
            } catch (err) {
                console.error("[tray-news-plugin] fetchFullArticle", err);
                return "Failed to load full article.";
            }
        }


        fetchNews();

        tray.render(() => {
            if (pageState.get() === "list") {
                const items = newsItems.get();
                if (!items.length) return tray.stack([tray.text("Loading news…")]);

                const page = currentPage.get();
                const start = page * ITEMS_PER_PAGE;
                const end = start + ITEMS_PER_PAGE;
                const pageItems = items.slice(start, end);

                const stackItems = pageItems.map((it) =>
                    tray.flex([
                        tray.stack([
                            tray.text(it.title, { style: { fontSize: 12, fontWeight: "bold" } }),
                            tray.text(it.description.slice(0, 200) + (it.description.length > 200 ? "…" : ""), { style: { fontSize: 11, opacity: 0.8 } }),
                        ], { style: { flex: 1 } }),
                        tray.button("Read", {
                            onClick: ctx.eventHandler(it.link, async () => {
                                const fullText = await fetchFullArticle(it.link);
                                currentArticle.set({ title: it.title, content: fullText });
                                pageState.set("article");
                            }),
                            size: "sm",
                            intent: "info",
                        }),
                    ])
                );

                const pagination = [];
                if (start > 0)
                    pagination.push(
                        tray.button("Prev", {
                            onClick: ctx.eventHandler("prev-page", () =>
                                currentPage.set(page - 1)
                            ),
                            size: "sm",
                            intent: "gray-subtle",
                        })
                    );
                if (end < items.length)
                    pagination.push(
                        tray.button("Next", {
                            onClick: ctx.eventHandler("next-page", () =>
                                currentPage.set(page + 1)
                            ),
                            size: "sm",
                            intent: "gray-subtle",
                        })
                    );

                return tray.stack([...stackItems, tray.flex(pagination, { gap: 1 })]);
            }

            if (pageState.get() === "article") {
                const article = currentArticle.get();
                if (!article) return tray.stack([tray.text("Loading article…")]);
                return tray.stack([
                    tray.button("← Back", {
                        onClick: ctx.eventHandler("back", () => pageState.set("list")),
                        size: "sm",
                        intent: "gray-subtle",
                    }),
                    tray.text(article.title, {
                        style: { fontWeight: "bold", fontSize: 14, margin: "4px 0" },
                    }),
                    tray.text(article.content, { style: { fontSize: 12 } }),
                ]);
            }
        });

        ctx.setInterval(fetchNews, 10 * 60 * 1000);
    });
}
