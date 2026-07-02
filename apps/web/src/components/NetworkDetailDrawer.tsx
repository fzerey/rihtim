"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Copy } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/i18n/provider";

interface NetworkInspect {
  Id: string;
  Name: string;
  Driver?: string;
  Scope?: string;
  Internal?: boolean;
  Attachable?: boolean;
  Ingress?: boolean;
  EnableIPv6?: boolean;
  Created?: string;
  IPAM?: {
    Driver?: string;
    Config?: Array<{ Subnet?: string; Gateway?: string; IPRange?: string }>;
    Options?: Record<string, string>;
  };
  Options?: Record<string, string>;
  Labels?: Record<string, string>;
  Containers?: Record<
    string,
    {
      Name: string;
      EndpointID?: string;
      MacAddress?: string;
      IPv4Address?: string;
      IPv6Address?: string;
    }
  >;
}

export function NetworkDetailDrawer({
  networkId,
  onClose,
}: {
  networkId: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const { data, isLoading, error } = useQuery({
    queryKey: ["network", networkId],
    queryFn: () => api<NetworkInspect>(`/networks/${networkId}`),
    refetchInterval: 5000,
  });

  const containers = useMemo(() => {
    if (!data?.Containers) return [];
    return Object.entries(data.Containers).map(([id, info]) => ({
      id,
      name: info.Name,
      ipv4: info.IPv4Address,
      ipv6: info.IPv6Address,
      mac: info.MacAddress,
    }));
  }, [data]);

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button
        aria-label={t("common.close")}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <aside className="relative w-full max-w-2xl bg-slate-950 border-l border-slate-800 h-full overflow-y-auto">
        <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate">{data?.Name ?? "…"}</h2>
            <div className="text-xs text-slate-500 font-mono truncate">{networkId}</div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-800"
            aria-label={t("common.close")}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {isLoading && (
          <div className="p-6 text-sm text-slate-400">{t("common.loading")}</div>
        )}
        {error && (
          <div className="p-6 text-sm text-rose-400">{(error as Error).message}</div>
        )}

        {data && (
          <div className="p-4 space-y-6">
            <Section title={t("networks.detail.general")}>
              <KV label={t("networks.columns.driver")} value={data.Driver} />
              <KV label={t("networks.columns.scope")} value={data.Scope} />
              <KV
                label={t("networks.detail.created")}
                value={data.Created ? new Date(data.Created).toLocaleString() : undefined}
              />
              <KV
                label={t("networks.detail.internal")}
                value={<Bool value={data.Internal} />}
              />
              <KV
                label={t("networks.detail.attachable")}
                value={<Bool value={data.Attachable} />}
              />
              <KV
                label={t("networks.detail.ingress")}
                value={<Bool value={data.Ingress} />}
              />
              <KV
                label={t("networks.detail.ipv6")}
                value={<Bool value={data.EnableIPv6} />}
              />
            </Section>

            {data.IPAM?.Config && data.IPAM.Config.length > 0 && (
              <Section title={t("networks.detail.ipam")}>
                <KV label="Driver" value={data.IPAM.Driver} />
                <div className="col-span-full">
                  <table className="w-full text-xs font-mono">
                    <thead className="text-slate-500">
                      <tr className="text-left">
                        <th className="py-1 pr-4">Subnet</th>
                        <th className="py-1 pr-4">Gateway</th>
                        <th className="py-1">IP range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.IPAM.Config.map((c, i) => (
                        <tr key={`${c.Subnet}-${i}`} className="border-t border-slate-800">
                          <td className="py-1 pr-4">{c.Subnet ?? "—"}</td>
                          <td className="py-1 pr-4">{c.Gateway ?? "—"}</td>
                          <td className="py-1">{c.IPRange ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            <Section
              title={t("networks.detail.containers", { count: containers.length })}
            >
              <div className="col-span-full">
                {containers.length === 0 ? (
                  <div className="text-sm text-slate-500">
                    {t("networks.detail.noContainers")}
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="text-slate-500">
                      <tr className="text-left">
                        <th className="py-1 pr-3">Name</th>
                        <th className="py-1 pr-3">IPv4</th>
                        <th className="py-1 pr-3">MAC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {containers.map((c) => (
                        <tr key={c.id} className="border-t border-slate-800">
                          <td className="py-1 pr-3 font-medium">{c.name}</td>
                          <td className="py-1 pr-3 font-mono">{c.ipv4 ?? "—"}</td>
                          <td className="py-1 pr-3 font-mono text-slate-500">
                            {c.mac ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Section>

            {data.Options && Object.keys(data.Options).length > 0 && (
              <Section title={t("networks.detail.options")}>
                <KVMap map={data.Options} />
              </Section>
            )}

            {data.Labels && Object.keys(data.Labels).length > 0 && (
              <Section title={t("networks.detail.labels")}>
                <KVMap map={data.Labels} />
              </Section>
            )}

            <details className="text-xs">
              <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
                {t("networks.detail.rawJson")}
              </summary>
              <div className="mt-2 relative">
                <button
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))}
                  className="absolute top-2 right-2 p-1 rounded hover:bg-slate-800"
                  title={t("common.copy")}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <pre className="bg-slate-900/60 border border-slate-800 rounded p-3 overflow-auto max-h-96 text-slate-300">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            </details>
          </div>
        )}
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-medium text-slate-200 mb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">{children}</div>
    </section>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xs text-slate-200 font-mono truncate">
        {value === undefined || value === null || value === "" ? (
          <span className="text-slate-600">—</span>
        ) : (
          value
        )}
      </div>
    </>
  );
}

function Bool({ value }: { value: boolean | undefined }) {
  if (value === undefined) return <span className="text-slate-600">—</span>;
  return (
    <span
      className={
        value
          ? "inline-block px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300"
          : "inline-block px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400"
      }
    >
      {value ? "yes" : "no"}
    </span>
  );
}

function KVMap({ map }: { map: Record<string, string> }) {
  return (
    <div className="col-span-full space-y-1 font-mono text-xs">
      {Object.entries(map).map(([k, v]) => (
        <div key={k} className="flex gap-3">
          <span className="text-slate-500">{k}</span>
          <span className="text-slate-200 break-all">{v}</span>
        </div>
      ))}
    </div>
  );
}
