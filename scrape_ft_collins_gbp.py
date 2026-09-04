import time
import json
import re
from playwright.sync_api import sync_playwright

SEARCH_QUERIES = [
    "concrete contractors in Fort Collins CO",
    "roofing contractors in Fort Collins CO",
    "landscaping in Fort Collins CO",
    "tree service in Fort Collins CO",
    "painters in Fort Collins CO",
    "fencing contractors in Fort Collins CO",
    "plumbing in Fort Collins CO",
    "hvac in Fort Collins CO",
    "paving contractors in Fort Collins CO",
    "excavation contractors in Fort Collins CO"
]

def scrape_google_maps():
    prospects = []
    seen_names = set()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        for query in SEARCH_QUERIES:
            if len(prospects) >= 30:
                break

            print(f"\n🔍 Searching Google Maps for: '{query}'...")
            url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}"
            try:
                page.goto(url, timeout=30000)
                page.wait_for_timeout(3000)

                # Scroll results panel to load items
                feed = page.locator('div[role="feed"]')
                if feed.count() > 0:
                    for _ in range(4):
                        feed.evaluate('el => el.scrollTop = el.scrollTop + 1200')
                        page.wait_for_timeout(1500)
                
                # Get business cards
                cards = page.locator('div[role="article"]').all()
                if not cards:
                    # Alternative selector
                    cards = page.locator('a.hfpxzc').all()

                print(f"  Found {len(cards)} listings for '{query}'. Checking for missing websites...")

                for card in cards:
                    if len(prospects) >= 30:
                        break

                    try:
                        # Extract title / name
                        aria_label = card.get_attribute("aria-label") or ""
                        if not aria_label:
                            text = card.inner_text()
                            lines = [l.strip() for l in text.split("\n") if l.strip()]
                            aria_label = lines[0] if lines else ""

                        name = aria_label.strip()
                        if not name or name in seen_names or "sponsored" in name.lower():
                            continue

                        # Click on card to open details pane
                        card.click(timeout=3000)
                        page.wait_for_timeout(1500)

                        # Check if a website button exists in the detail panel
                        # Google Maps detail panel has buttons like [Website], [Directions], [Save], [Call]
                        website_btn = page.locator('a[data-item-id="authority"], a[aria-label*="website"], a[aria-label*="Website"]')
                        has_website = False
                        if website_btn.count() > 0:
                            href = website_btn.first.get_attribute("href") or ""
                            if href and not href.startswith("https://www.google.com"):
                                has_website = True

                        if has_website:
                            continue # Skip businesses that already have a website!

                        # Check rating and reviews
                        rating = "N/A"
                        reviews = "0"
                        rating_el = page.locator('div.F7nice, span.ceA4re').first
                        if rating_el.count() > 0:
                            rating_text = rating_el.inner_text()
                            match = re.search(r'([0-9]\.[0-9])', rating_text)
                            if match:
                                rating = match.group(1)
                            rev_match = re.search(r'\(([0-9,]+)\)', rating_text)
                            if rev_match:
                                reviews = rev_match.group(1).replace(",", "")

                        # Check phone
                        phone = "N/A"
                        phone_el = page.locator('button[data-item-id^="phone:"], button[aria-label*="Phone:"]').first
                        if phone_el.count() > 0:
                            p_label = phone_el.get_attribute("aria-label") or phone_el.inner_text()
                            phone_match = re.search(r'(\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4})', p_label)
                            if phone_match:
                                phone = phone_match.group(1)
                            else:
                                phone = p_label.replace("Phone: ", "").strip()

                        # Check address
                        address = "Fort Collins, CO"
                        addr_el = page.locator('button[data-item-id="address"], button[aria-label*="Address:"]').first
                        if addr_el.count() > 0:
                            address = addr_el.get_attribute("aria-label") or addr_el.inner_text()
                            address = address.replace("Address: ", "").strip()

                        # Check category
                        category = query.split(" in ")[0].capitalize()
                        cat_el = page.locator('button.DkEaL').first
                        if cat_el.count() > 0:
                            category = cat_el.inner_text().strip()

                        # Filter: must look like a viable business (has phone, or established reviews)
                        seen_names.add(name)
                        item = {
                            "name": name,
                            "category": category,
                            "rating": rating,
                            "reviews": reviews,
                            "phone": phone,
                            "address": address,
                            "website": "None (No Website Found)",
                            "gbp_url": page.url
                        }
                        prospects.append(item)
                        print(f"  ⭐ [FOUND #{len(prospects)}] {name} | {category} | {phone} | Reviews: {reviews} ({rating}★)")

                    except Exception as e:
                        continue

            except Exception as e:
                print(f"  Error on query {query}: {e}")

        browser.close()

    return prospects

if __name__ == "__main__":
    results = scrape_google_maps()
    with open("/Users/fredcaldero/.gemini/antigravity-ide/scratch/origin-local/scraped_leads_raw.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n✅ Finished! Scraped {len(results)} businesses without a website.")
EOF
