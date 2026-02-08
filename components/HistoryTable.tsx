import type { HistoryItem } from '@/lib/types';

interface HistoryTableProps {
  items: HistoryItem[];
  onClear: () => void;
}

export default function HistoryTable({ items, onClear }: HistoryTableProps) {
  const visibleItems = items.slice().reverse().slice(0, 10);
  return (
    <div className="statusBox">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <b>Your results</b>
        <button id="clearHistoryBtn" className="btnGhost" type="button" onClick={onClear}>
          Clear history
        </button>
      </div>
      <div style={{ height: 10 }} />
      {visibleItems.length === 0 ? (
        <div className="muted">No rounds yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Tiles</th>
              <th>Target</th>
              <th>Your value</th>
              <th>Outcome</th>
              <th>Your steps</th>
              <th>Best</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => {
              const isExact = item.userFinalValue !== null && item.userFinalValue === item.target;
              const didSubmit = item.didSubmit ?? true;
              const outcome = item.outcome ?? (didSubmit ? 'OK' : 'FAIL');
              return (
                <tr key={item.ts} className={isExact ? 'exactRow' : undefined}>
                  <td>{new Date(item.ts).toLocaleString()}</td>
                  <td className="mono">{item.tilesAtStart.join(', ')}</td>
                  <td>{item.target}</td>
                  <td className={isExact ? 'exactValue' : undefined}>{item.userFinalValue ?? ''}</td>
                  <td className={outcome === 'FAIL' ? 'bad' : undefined}>{outcome}</td>
                  <td>
                    {item.userSteps.length ? (
                      <details>
                        <summary>View steps</summary>
                        <div className="mono" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
                          {item.userSteps.join('\n')}
                        </div>
                      </details>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{item.bestFinalValue ?? ''}</td>
                  <td>{item.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
