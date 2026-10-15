import { FrameApp } from "@/components/FrameApp";
import { loadCatalog } from "@/lib/catalog";

export const metadata = { title: "Jimkit tool", robots: { index: false, follow: false } };

/** One tool and nothing else, for the "looks" row on the home page. ?look=metro&mode=dark&accent=blue&tool=text-editor&doc=json */
export default function Frame() {
  const { tools, categories } = loadCatalog();
  return (
    <>
      {/* runs before paint and wins over the visitor's saved look, so the frame shows the look it was asked for */}
      <script dangerouslySetInnerHTML={{ __html: `(function(){var q=new URLSearchParams(location.search),h=document.documentElement;var t=q.get("look"),m=q.get("mode"),a=q.get("accent");if(t==="basic"||t==="glass"||t==="metro"){h.dataset.theme=t;if(t==="metro")h.setAttribute("data-flat","")}if(m==="dark"||m==="light")h.dataset.mode=m;if(a&&/^(blue|teal|green|orange|pink|purple)$/.test(a))h.dataset.accent=a;})();` }} />
      <FrameApp tools={tools} categories={categories} />
    </>
  );
}
