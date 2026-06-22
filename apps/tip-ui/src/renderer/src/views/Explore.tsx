import { Box, Loader, Stack, Text, Group, TextInput, Button, Card, Modal, Badge, ScrollArea, Code } from "@mantine/core";
import { useEffect, useState } from "react";
import { useManagerClient } from "../context/managerClient";

export default function ExploreView() {
  const manager = useManagerClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // pages: array of pages, each page is array of servers
  const [pages, setPages] = useState<any[][]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [search, setSearch] = useState("");

  const [selectedServer, setSelectedServer] = useState<any | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    // initial load when component mounts or when search changes
    let cancelled = false;

    async function loadFirst() {
      setLoading(true);
      setError(null);
      setPages([]);
      setNextCursor(null);
      setCurrentPage(0);

      try {
        const params: any = { type: "official" };
        if (search.trim()) params.search = search.trim();

        const result: any = await manager.outbound.requests.servers.list(params);

        if (cancelled) return;

        if (result.ready === false) {
          setPages([]);
          setNextCursor(null);
        } else {
          setPages([Array.isArray(result.servers) ? result.servers : []]);
          setNextCursor(result.nextCursor ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadFirst();

    return () => {
      cancelled = true;
    };
  }, [manager, search]);

  async function fetchNext() {
    if (!nextCursor) return;
    setLoading(true);
    setError(null);

    try {
      const params: any = { type: "official", cursor: nextCursor };
      if (search.trim()) params.search = search.trim();

      const result: any = await manager.outbound.requests.servers.list(params);

      const newPage = Array.isArray(result.servers) ? result.servers : [];
      setPages((prev) => [...prev, newPage]);
      setNextCursor(result.nextCursor ?? null);
      setCurrentPage((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const currentServers = pages[currentPage] ?? [];

  function openDetails(server: any) {
    setSelectedServer(server);
    setDetailOpen(true);
  }

  function closeDetails() {
    setDetailOpen(false);
    setSelectedServer(null);
  }

  return (
    <Box p="md">
      <Stack gap="md">
        <Group style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text fw={600}>Explore — official servers</Text>
          <Group>
            <TextInput placeholder="Search" value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
            <Button onClick={() => { setSearch(""); }}>Clear</Button>
          </Group>
        </Group>

        {loading && pages.length === 0 ? (
          <Box className="flex min-h-full items-center justify-center">
            <Loader color="dark" />
          </Box>
        ) : error ? (
          <Box p="md">
            <Text color="red">Error: {error}</Text>
          </Box>
        ) : (
          <>
            <Box style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
              {currentServers.map((s, idx) => (
                <Card key={idx} shadow="sm" radius="md" p="sm" onClick={() => openDetails(s)} style={{ cursor: 'pointer' }}>
                  <Text fw={700}>{s.server?.name ?? s.serverName ?? s.name ?? "Unnamed"}</Text>
                  <Text size="sm" color="dimmed">{s.server?.version ?? s.version ?? ""}</Text>
                  <Text size="sm" mt="8px">{s.server?.summary ?? s.summary ?? ""}</Text>
                </Card>
              ))}
            </Box>

            <Group style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }} mt="md">
              <Button disabled={currentPage === 0} onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}>
                Prev
              </Button>

              <Text size="sm">Page {currentPage + 1} of {Math.max(1, pages.length)}</Text>

              <Button
                onClick={() => {
                  // if there is a next page already fetched, just advance
                  if (currentPage < pages.length - 1) {
                    setCurrentPage((p) => p + 1);
                    return;
                  }

                  // otherwise fetch next if cursor exists
                  void fetchNext();
                }}
                disabled={!nextCursor && currentPage >= pages.length - 1}
              >
                {currentPage < pages.length - 1 ? "Next" : "Load more"}
              </Button>
            </Group>
          </>
        )}
      </Stack>

      <Modal opened={detailOpen} onClose={closeDetails} fullScreen title={selectedServer ? (selectedServer.server?.name ?? selectedServer.serverName ?? selectedServer.name) : "Details"}>
        {selectedServer ? (
          <Stack gap="md">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Text fw={700}>{selectedServer.server?.name ?? selectedServer.serverName ?? selectedServer.name}</Text>
                <Text size="sm" color="dimmed">{selectedServer.server?.version ?? selectedServer.version ?? ""}</Text>
              </div>
              <div>
                {selectedServer.server?.category && <Badge style={{ marginRight: 6 }}>{selectedServer.server.category}</Badge>}
                {selectedServer.server?.homepage && (
                  <a href={selectedServer.server.homepage} target="_blank" rel="noreferrer">Homepage</a>
                )}
              </div>
            </div>

            <Text size="sm">{selectedServer.server?.summary ?? selectedServer.summary ?? "No summary"}</Text>

            <Text fw={600}>Raw JSON</Text>
            <ScrollArea style={{ height: '60vh' }}>
              <Code block>{JSON.stringify(selectedServer, null, 2)}</Code>
            </ScrollArea>
          </Stack>
        ) : null}
      </Modal>
    </Box>
  );
}
