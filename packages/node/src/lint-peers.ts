import {
  issue,
  parseRef,
  newTrace,
  type KB,
  type Peer,
  type Issue,
} from "@sontx/simplink-core";
export async function lintPeers(kb: KB, peers: Peer[]): Promise<Issue[]> {
  const issues: Issue[] = [];
  await Promise.all(
    peers.map(async (peer) => {
      const refs = kb.graph.edges.filter(
        (edge) => parseRef(edge.to).simp === peer.name,
      );
      try {
        await peer.manifest();
        if (!refs.length) return;
        const response = await peer.lookup({
          ids: [...new Set(refs.map((edge) => edge.to))],
          trace: newTrace(),
        });
        const nodes = new Map(response.nodes.map((node) => [node.id, node]));
        for (const edge of refs) {
          const parsed = parseRef(edge.to),
            node = nodes.get(edge.to) ?? nodes.get(parsed.id),
            path = kb.node(edge.from)!.path;
          if (!node)
            issues.push(issue("E007", path, `missing reference "${edge.to}"`));
          else if (
            node.type !==
            (parsed.id === "simp" ? "simp" : parsed.id.split(".")[0])
          )
            issues.push(
              issue("E003", path, `wrong type for "${edge.to}": ${node.type}`),
            );
        }
      } catch (error) {
        issues.push(
          issue(
            "W109",
            "simp.md",
            `peer "${peer.name}" unreachable: ${(error as Error).message}`,
          ),
        );
      }
    }),
  );
  return issues.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.code.localeCompare(b.code) ||
      a.message.localeCompare(b.message),
  );
}
