import type { LayoutCategory, LayoutTool } from "@jimkit/sdk";
import { useLayout } from "@jimkit/sdk/react";
import { Icon } from "@jimkit/ui";

/** One tool: a row you press to open, with its ⋮ menu; while arranging, the row is something to move. */
function Row({ tool, siblings }: { tool: LayoutTool; siblings: string[] }) {
  const L = useLayout();
  const { Grip, ToolMarks, ToolMenuButton } = L.parts;
  const sort = L.useToolSort(tool, siblings);
  const menu = L.useToolContextMenu(tool);
  return (
    <li {...sort.item} {...sort.handle} {...(sort.arranging ? {} : menu.bind)} className="flex items-center gap-3 border-b border-line py-2">
      <Icon name={tool.icon} size={18} />
      {sort.arranging ? (
        <>
          <span className="flex-1">{tool.name}</span>
          <ToolMarks tool={tool} />
          <Grip sort={sort} />
        </>
      ) : (
        <>
          <button className="flex-1 text-left disabled:opacity-50" disabled={tool.state !== "ready"} onClick={() => L.open(tool)}>
            {tool.name} <span className="text-faint">{tool.state === "ready" ? tool.blurb : tool.note ?? tool.state}</span>
          </button>
          <ToolMenuButton tool={tool} />
        </>
      )}
      {menu.menu}
    </li>
  );
}

function Section({ category, siblings }: { category: LayoutCategory; siblings: string[] }) {
  const L = useLayout();
  const sort = L.useCategorySort(category, siblings);
  const ids = category.tools.map((t) => t.id);
  return (
    <section {...sort.item} className="mb-8">
      <h2 {...sort.handle} className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-dim">
        {sort.arranging && <L.parts.Grip sort={sort} axis="y" />}
        {category.name}
      </h2>
      <ul>{category.tools.map((t) => <Row key={t.id} tool={t} siblings={ids} />)}</ul>
    </section>
  );
}

export function ListLayout() {
  const L = useLayout();
  const ids = L.categories.map((c) => c.id);
  return (
    <main className="mx-auto max-w-[720px] px-5 py-10">
      <header className="mb-8 flex items-center gap-2">
        <h1 className="flex-1 text-[28px] font-semibold">{L.siteName}</h1>
        <button onClick={L.openSearch} className="rounded-lg border border-line px-3 py-1.5 text-[13px]">Search</button>
        <button onClick={L.chooseFiles} className="rounded-lg border border-line px-3 py-1.5 text-[13px]">Files</button>
        {L.canManageKits && <button onClick={L.openKits} className="rounded-lg border border-line px-3 py-1.5 text-[13px]">Kits</button>}
        <button onClick={() => L.setArranging(true)} className="rounded-lg border border-line px-3 py-1.5 text-[13px]">Edit</button>
        <button onClick={L.openSettings} className="rounded-lg border border-line px-3 py-1.5 text-[13px]">Settings</button>
      </header>
      {L.categories.map((c) => <Section key={c.id} category={c} siblings={ids} />)}
      {!L.categories.length && <p className="text-dim">{L.toolCount ? "Everything is hidden. Press Edit to show some." : "No tools are installed."}</p>}
      {L.arranging && <L.parts.ArrangeBar />}
    </main>
  );
}
