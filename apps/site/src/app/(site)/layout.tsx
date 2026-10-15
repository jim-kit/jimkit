import { DemoProvider } from "@/components/Demo";
import { DropZone } from "@/components/DropZone";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Palette } from "@/components/Palette";
import { ScrollBar } from "@/components/ScrollBar";
import { loadCatalog, productVersion } from "@/lib/catalog";
import { DOCS } from "@/lib/docs-meta";

/** Everything with the site's header and footer. The bare demo frame (../frame) is outside it. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const { tools, categories, actions } = loadCatalog();
  return (
    <DemoProvider first={tools.find((t) => t.demo)!.id}>
      <ScrollBar />
      <Header />
      {children}
      <Footer version={productVersion()} />
      <Palette tools={tools} categories={categories} docs={DOCS} />
      <DropZone actions={actions} />
    </DemoProvider>
  );
}
