/** The published docs: order, grouping and one-line summaries. Pure data, so client components can import it too. */
export interface DocMeta { slug: string; title: string; /** the <title> of its page, for search results: longer and more specific than the menu entry */ seo: string; blurb: string; group: "Start" | "Use" | "Build" | "Reference" }

// a file that is not listed here is not published
export const DOCS: DocMeta[] = [
  { slug: "install", title: "Installing", seo: "Install with Docker or Proxmox", blurb: "Docker, Proxmox, updating and removing.", group: "Start" },
  { slug: "configuration", title: "Configuration", seo: "Configuration: environment variables and jimkit.config.json", blurb: "Environment variables and jimkit.config.json.", group: "Start" },
  { slug: "reverse-proxy", title: "Behind a reverse proxy", seo: "Run it behind Caddy, Nginx, Traefik or Cloudflare", blurb: "Caddy, Nginx, Traefik and Cloudflare, and how to check it.", group: "Start" },
  { slug: "themes", title: "Themes and accents", seo: "Themes and accents: make a look", blurb: "Basic, Paper, Glass and Metro, dark and light, and how the tokens work.", group: "Use" },
  { slug: "kits", title: "Kits", seo: "Kits: add tools and looks from GitHub", blurb: "Add tools from GitHub, what is checked, and how to publish one.", group: "Use" },
  { slug: "addons", title: "Writing a kit", seo: "Write a kit: a tutorial with a server route", blurb: "A tutorial that builds one, with a server route.", group: "Build" },
  { slug: "icons", title: "Icons and their motion", seo: "Icons and their motion for kits", blurb: "Every built-in icon, how each one moves, and how to bring your own.", group: "Build" },
  { slug: "layouts", title: "Layouts", seo: "Layouts: draw the home screen your own way", blurb: "Draw the home screen your own way: the API, the parts, and a full example.", group: "Build" },
  { slug: "architecture", title: "Architecture", seo: "Architecture: how the pieces fit", blurb: "How the pieces fit together.", group: "Build" },
  { slug: "security", title: "Security", seo: "Security: who counts as on your network", blurb: "Who counts as on your network, and what is and isn't protected.", group: "Reference" },
];

