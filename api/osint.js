export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let rawUrl = (req.query?.url || req.body?.url || '').trim();
  if (!rawUrl) {
    return res.status(400).json({ status: 'error', message: 'Missing url parameter' });
  }

  if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    rawUrl = 'https://' + rawUrl;
  }

  const result = {
    status: 'success',
    url: rawUrl,
    cms: 'Custom / HTML5',
    chat_widget: 'NO (Missing Webchat)',
    online_booking: 'NO',
    ad_pixels: 'None (No Retargeting)',
    geo_schema: 'NO (Invisible to AI Search)',
    emails: [],
    fb_url: '',
    fb_dm: '',
    title: '',
    vulnerabilities: []
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5500);

    const response = await fetch(rawUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    clearTimeout(timer);

    const html = await response.text();
    const hLow = html.toLowerCase();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      result.title = titleMatch[1].replace(/\s+/g, ' ').trim();
    }

    // 1. CMS Fingerprinting
    if (hLow.includes('wp-content') || hLow.includes('wp-includes')) result.cms = 'WordPress';
    else if (hLow.includes('wix.com') || hLow.includes('wixsite') || hLow.includes('parastorage.com')) result.cms = 'Wix';
    else if (hLow.includes('squarespace')) result.cms = 'Squarespace';
    else if (hLow.includes('godaddy') || hLow.includes('wsimg.com')) result.cms = 'GoDaddy Builder';
    else if (hLow.includes('webflow')) result.cms = 'Webflow';
    else if (hLow.includes('shopify')) result.cms = 'Shopify';
    else if (hLow.includes('duda') || hLow.includes('irp.cdn-website.com')) result.cms = 'Duda';
    else if (hLow.includes('leadconnectorhq') || hLow.includes('msgsndr.com')) result.cms = 'GoHighLevel Funnel';

    // 2. Chat Widget Fingerprinting
    if (hLow.includes('leadconnectorhq') || hLow.includes('msgsndr.com') || hLow.includes('lc_text_widget')) {
      result.chat_widget = 'YES (GoHighLevel / LeadConnector)';
    } else if (hLow.includes('podium.com')) {
      result.chat_widget = 'YES (Podium)';
    } else if (hLow.includes('intercom')) {
      result.chat_widget = 'YES (Intercom)';
    } else if (hLow.includes('tawk.to')) {
      result.chat_widget = 'YES (Tawk.to)';
    } else if (hLow.includes('livechatinc') || hLow.includes('tidio') || hLow.includes('zendesk') || hLow.includes('birdeye') || hLow.includes('chiirp')) {
      result.chat_widget = 'YES (3rd-Party Webchat)';
    } else {
      result.chat_widget = 'NO (Missing Webchat)';
      result.vulnerabilities.push('Missing AI Webchat Widget');
    }

    // 3. Online Booking Fingerprinting
    if (hLow.includes('housecallpro.com')) result.online_booking = 'YES (Housecall Pro)';
    else if (hLow.includes('getjobber.com')) result.online_booking = 'YES (Jobber)';
    else if (hLow.includes('servicetitan')) result.online_booking = 'YES (ServiceTitan)';
    else if (hLow.includes('calendly.com')) result.online_booking = 'YES (Calendly)';
    else if (hLow.includes('acuityscheduling') || hLow.includes('booksy.com') || hLow.includes('urable.com')) result.online_booking = 'YES (Online Scheduler)';
    else {
      result.online_booking = 'NO';
      result.vulnerabilities.push('No Online Booking Calendar');
    }

    // 4. Paid Ad Pixels
    const pixels = [];
    if (hLow.includes('fbevents.js') || hLow.includes('connect.facebook.net') || hLow.includes('fbq(')) pixels.push('Meta Pixel');
    if (hLow.includes('googletagmanager.com') || hLow.includes('gtag(') || hLow.includes('googleadservices.com')) pixels.push('Google GTM/Ads');
    if (hLow.includes('analytics.tiktok.com')) pixels.push('TikTok Pixel');
    result.ad_pixels = pixels.length ? pixels.join(', ') : 'None (No Retargeting)';
    if (!pixels.length) result.vulnerabilities.push('No Ad Retargeting Pixels');

    // 5. GEO / JSON-LD Schema
    if (hLow.includes('application/ld+json') && (hLow.includes('localbusiness') || hLow.includes('contractor') || hLow.includes('homeandconstructionbusiness'))) {
      result.geo_schema = 'YES (JSON-LD Schema)';
    } else {
      result.geo_schema = 'NO (Invisible to AI Search)';
      result.vulnerabilities.push('Invisible to AI/ChatGPT Search (Missing Schema)');
    }

    // 6. Emails
    const emailMatches = html.match(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g) || [];
    const badDomains = ['sentry.io', 'wixpress.com', 'example.com', 'domain.com', 'schema.org', 'w3.org', 'godaddy.com'];
    const badExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.css', '.js', '.woff'];
    const cleanEmails = [];
    for (const rawEm of emailMatches) {
      const em = rawEm.toLowerCase().replace(/\.$/, '');
      if (badExts.some(ext => em.endsWith(ext))) continue;
      if (badDomains.some(d => em.includes(d))) continue;
      if (!cleanEmails.includes(em) && cleanEmails.length < 5) {
        cleanEmails.push(em);
      }
    }
    result.emails = cleanEmails;

    // 7. Facebook & 1-Click m.me Link
    const fbMatch = html.match(/https?:\/\/(?:www\.)?facebook\.com\/([A-Za-z0-9_.\-]+)/i);
    if (fbMatch && !['sharer', 'plugins', 'tr', 'dialog', 'groups', 'events'].includes(fbMatch[1].toLowerCase())) {
      result.fb_url = fbMatch[0];
      result.fb_dm = `https://m.me/${fbMatch[1]}`;
    }

    return res.status(200).json(result);
  } catch (err) {
    result.cms = 'Unreachable / Broken SSL';
    result.vulnerabilities.push('Broken or Unreachable Website');
    result.error = err.message;
    return res.status(200).json(result);
  }
}
