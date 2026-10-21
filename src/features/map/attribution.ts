import { parseUrl } from '../../../config/validation';

// Leaflet attribution accepts HTML strings only. Validate the URL, then encode for its quoted attribute.
export function oneMapAttribution(baseUrl: string) {
  const logoUrl = `${parseUrl(baseUrl)}/web-assets/images/logo/om_logo.png`;
  const attribute = logoUrl.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  return `<img src="${attribute}" alt="" style="height:16px;width:16px;display:inline;vertical-align:-3px"/>&nbsp;` +
    '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;' +
    '<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';
}
