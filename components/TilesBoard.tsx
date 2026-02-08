import type { Tile } from '@/lib/types';

interface TilesBoardProps {
  tiles: Tile[];
  selectedIds: string[];
  lockedId: string | null;
  interactionEnabled: boolean;
  onTileClick: (id: string) => void;
  hint: string;
  canPickOperator: boolean;
  pendingOp: '+' | '-' | '*' | '/' | null;
  onOperation: (op: '+' | '-' | '*' | '/') => void;
  canLockIn: boolean;
  onLockIn: () => void;
}

export default function TilesBoard({
  tiles,
  selectedIds,
  lockedId,
  interactionEnabled,
  onTileClick,
  hint,
  canPickOperator,
  pendingOp,
  onOperation,
  canLockIn,
  onLockIn
}: TilesBoardProps) {
  return (
    <div className="tilesWrap">
      <div className="muted">Tiles</div>
      <div className="tileRow">
        {tiles.map((tile) => {
          const isSelected = selectedIds.includes(tile.id);
          const isLocked = lockedId === tile.id;
          return (
            <div
              key={tile.id}
              className={`tile${tile.revealed ? ' revealed' : ''}${isSelected ? ' selected' : ''}${isLocked ? ' locked' : ''}`}
            >
              <div className="card">
                <div className="face front" />
                <div className="face back">
                  <button
                    type="button"
                    disabled={!interactionEnabled || !tile.revealed}
                    onClick={() => onTileClick(tile.id)}
                  >
                    {tile.value}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="opsBar">
        <button
          className={`opBtn${pendingOp === '+' ? ' active' : ''}`}
          data-op="+"
          disabled={!canPickOperator}
          onClick={() => onOperation('+')}
        >
          +
        </button>
        <button
          className={`opBtn${pendingOp === '-' ? ' active' : ''}`}
          data-op="-"
          disabled={!canPickOperator}
          onClick={() => onOperation('-')}
        >
          -
        </button>
        <button
          className={`opBtn${pendingOp === '*' ? ' active' : ''}`}
          data-op="*"
          disabled={!canPickOperator}
          onClick={() => onOperation('*')}
        >
          ×
        </button>
        <button
          className={`opBtn${pendingOp === '/' ? ' active' : ''}`}
          data-op="/"
          disabled={!canPickOperator}
          onClick={() => onOperation('/')}
        >
          ÷
        </button>
      </div>

      <div className="rowRight" style={{ justifyContent: 'center', marginTop: 10 }}>
        <button id="lockInBtn" className="btnGhost lockBtn" disabled={!canLockIn} onClick={onLockIn}>
          Lock in your answer
        </button>
      </div>

      <div className="smallNote" style={{ textAlign: 'center' }}>
        {hint}
      </div>
    </div>
  );
}
