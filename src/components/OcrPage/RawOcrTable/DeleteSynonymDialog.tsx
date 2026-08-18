// 2026-08-18 · <Modal> 프레임워크 통합 · 동의어 삭제 확인 다이얼로그
import React from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "../../common/Modal";
import { IconTile } from "../../common/IconTile";

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
  const confirmDelete = async () => {
    const { ri, origName } = deleteSynConfirm;
    setDeleteSynConfirm(null);
    await deleteSynonymByName(origName);
    setAutoSynonymMatches(prev => { const s = { ...prev }; delete s[ri]; return s; });
  };

  return (
    <Modal
      open={true}
      onClose={() => setDeleteSynConfirm(null)}
      size="sm"
      titleAccent
      icon={<IconTile icon={<Trash2 size={14} />} tone="rose" size="md" />}
      title="동의어 삭제"
      footer={
        <>
          <button
            type="button"
            onClick={() => setDeleteSynConfirm(null)}
            className="h-10 px-4 text-[14px] font-bold bg-white hover:bg-brand-tint border border-line hover:border-brand-deep rounded-lg text-ink transition cursor-pointer"
          >
            아니오
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            className="h-10 px-6 text-[15px] font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-lg
              shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_2px_6px_-1px_rgba(244,63,94,0.25)]
              transition cursor-pointer"
          >
            예, 삭제
          </button>
        </>
      }
    >
      <p className="text-[13px] text-ink-soft leading-relaxed">
        <span className="line-through text-zinc-400">{deleteSynConfirm.origName}</span>의 동의어 매핑을 삭제합니다.
      </p>
    </Modal>
  );
};
