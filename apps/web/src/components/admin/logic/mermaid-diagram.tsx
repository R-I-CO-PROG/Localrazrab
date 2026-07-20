"use client";

import { useEffect, useId } from "react";

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

export function MermaidDiagram({ chart, className }: MermaidDiagramProps) {
  const domId = useId().replace(/:/g, "");

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        securityLevel: "loose",
        themeVariables: {
          darkMode: true,
          background: "transparent",
          primaryColor: "#12161B",
          primaryTextColor: "#E6EAEE",
          primaryBorderColor: "#2A323C",
          secondaryColor: "#12161B",
          secondaryTextColor: "#E6EAEE",
          secondaryBorderColor: "#2A323C",
          tertiaryColor: "#12161B",
          tertiaryTextColor: "#E6EAEE",
          tertiaryBorderColor: "#2A323C",
          lineColor: "#2A323C",
          textColor: "#E6EAEE",
          nodeBorder: "#2A323C",
          mainBkg: "#12161B",
          clusterBkg: "#0E1216",
          clusterBorder: "#2A323C",
          edgeLabelBackground: "#12161B",
          activeTaskBkgColor: "#34D17F",
          activeTaskBorderColor: "#34D17F",
        },
      });

      const el = document.getElementById(domId);
      if (!el || cancelled || !chart.trim()) return;

      try {
        const { svg } = await mermaid.render(`logic-${domId}`, chart);
        if (!cancelled) el.innerHTML = svg;
      } catch (err) {
        if (!cancelled) {
          el.innerHTML = `<pre class="text-xs text-muted-foreground whitespace-pre-wrap">${String(err)}</pre>`;
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [chart, domId]);

  return (
    <div
      id={domId}
      className={className ?? "overflow-x-auto rounded-lg border bg-muted/20 p-4 text-sm"}
    />
  );
}
