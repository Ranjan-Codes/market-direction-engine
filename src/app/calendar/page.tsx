import { getEvents } from "../../lib/data/queries";
import { Panel } from "../../components/ui";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const events = await getEvents(30);
  const byDay = new Map<string, typeof events>();
  for (const e of events) {
    const day = e.release_at.slice(0, 10);
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(e);
  }
  const blackoutEnd = new Date();
  blackoutEnd.setDate(blackoutEnd.getDate() + 5);
  const blackoutEndIso = blackoutEnd.toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">
        Economic & earnings calendar{" "}
        <span className="text-xs font-normal text-zinc-500">
          next 30 days · rows inside the 5-day signal-blackout window are highlighted
        </span>
      </h1>
      {[...byDay.entries()].map(([day, list]) => (
        <Panel key={day} title={new Date(day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}>
          <table className="w-full text-xs">
            <thead className="text-zinc-500 text-left">
              <tr><th className="py-1 w-16">Time</th><th className="w-12">Mkt</th><th>Event</th><th className="w-20">Importance</th><th className="w-24">Consensus</th><th className="w-24">Previous</th></tr>
            </thead>
            <tbody>
              {list.map((e, i) => (
                <tr
                  key={i}
                  className={`border-t border-zinc-900 ${day <= blackoutEndIso ? "bg-amber-950/30" : ""}`}
                >
                  <td className="py-1 text-zinc-500">{e.release_at.slice(11, 16)}</td>
                  <td className="text-zinc-400">{e.country}</td>
                  <td className={e.event_name.startsWith("Earnings:") ? "text-sky-300" : ""}>{e.event_name}</td>
                  <td>
                    <span className={
                      e.importance === "high" ? "text-red-400 font-semibold"
                      : e.importance === "medium" ? "text-amber-400" : "text-zinc-500"
                    }>
                      {e.importance}
                    </span>
                  </td>
                  <td>{e.consensus != null ? `${e.consensus}${e.unit ?? ""}` : "–"}</td>
                  <td className="text-zinc-400">{e.previous != null ? `${e.previous}${e.unit ?? ""}` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ))}
      <p className="text-[10px] text-zinc-600">
        Macro consensus/previous from the calendar feed (≈7-day forward visibility); earnings dates from
        exchange data (30+ days). Actual-vs-consensus surprise tracking arrives with the release actuals.
      </p>
    </div>
  );
}
