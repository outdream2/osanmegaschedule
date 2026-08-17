import React from "react";

export type DeleteSynConfirmState = { ri: number; origName: string };

interface DeleteSynonymDialogProps {
  deleteSynConfirm: DeleteSynConfirmState;
  setDeleteSynConfirm: React.Dispatch<React.SetStateAction<DeleteSynConfirmState | null>>;
  deleteSynonymByName: (origName: string, productCode?: string) => Promise<void>;
  setAutoSynonymMatches: React.Dispatch<React.SetStateAction<Record<number, { code: string; name: string }>>>;
}

export const DeleteSynonymDialog: React.FC<DeleteSynonymDialogProps> = ({
  deleteSynConfirm, setDeleteSynConfirm, deleteSynonymByName, setAutoSynonymMatches,
}) => {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-zinc-100 space-y-4">
        <p className="text-sm font-bold text-zinc-800">동의어를 삭제하시겠습니까?</p>
        <p className="text-xs text-zinc-500 leading-relaxed">
          <span className="line-through text-gray-400">{deleteSynConfirm.origName}</span>의 동의어 매핑을 삭제합니다.
        </p>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => setDeleteSynConfirm(null)}
            className="flex-1 px-3 py-2 text-xs font-bold bg-zinc-50 hover:bg-zinc-100 border border-line rounded-lg text-zinc-600 cursor-pointer">아니오</button>
          <button type="button"
            onClick={async () => {
              const { ri, origName } = deleteSynConfirm;
              setDeleteSynConfirm(null);
              await deleteSynonymByName(origName);
              setAutoSynonymMatches(prev => { const s = { ...prev }; delete s[ri]; return s; });
            }}
            className="flex-1 px-3 py-2 text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white rounded-lg cursor-pointer">예, 삭제</button>
        </div>
      </div>
    </div>
  );
};
