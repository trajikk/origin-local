export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const rawInput =
      (req.query && (req.query.domain || req.query.url || req.query.website)) ||
      (req.body && (req.body.domain || req.body.url || req.body.website)) ||
      "";

    if (!rawInput) {
      return res.status(200).json({
        status: "no_url_provided",
        domain: "",
        title: "No Website Provided",
        description: "Caller did not provide a website URL.",
        services_summary:
          "Ask the caller for their business name, city, and top 2-3 services so you can run the custom demo using their spoken details."
      });
    }

    // Normalize spoken URLs like "apex dash concrete dot com"
    let cleaned = String(rawInput)
      .toLowerCase()
      .trim()
      .replace(/\s+dash\s+/g, "-")
      .replace(/\s+hyphen\s+/g, "-")
      .replace(/\s+dot\s+/g, ".")
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\s+/g, "")
      .replace(/\/+$/, "");

    if (!cleaned.includes(".")) {
      cleaned = `${cleaned}.com`;
    }

    const targetUrl = `https://${cleaned}`;
    const jinaUrl = `https://r.jina.ai/${targetUrl}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);

    const response = await fetch(jinaUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Retain-Images": "none"
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(200).json({
        status: "fallback",
        domain: cleaned,
        title: cleaned,
        description: `Could not reach ${cleaned} directly.`,
        services_summary: `The website ${cleaned} did not respond in time or may be misspelled. Confirm the business name, city, and core services directly with the caller and proceed with the demo.`
      });
    }

    const json = await response.json();
    const data = json.data || {};
    const title = (data.title || cleaned).slice(0, 160);
    const description = (data.description || "").slice(0, 300);
    const rawContent = String(data.content || "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();

    const servicesSummary = rawContent.slice(0, 1400) || description || `Homepage loaded for ${cleaned}.`;

    return res.status(200).json({
      status: "success",
      domain: cleaned,
      title,
      description,
      services_summary: servicesSummary
    });
  } catch (err) {
    return res.status(200).json({
      status: "fallback",
      domain: "unknown",
      title: "Website Lookup Fallback",
      description: "Live scrape timed out or domain was unreachable.",
      services_summary:
        "Use the caller's spoken business name, city, trade, and top services to deliver the tailored receptionist demo."
    });
  }
}

