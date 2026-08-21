// src/components/common/features/AddressSearchModal.tsx
// 다음(카카오) 우편번호 검색 공용 모달 · T-Address-Impl (2026-08-07)
//
// 사용 예:
//   const [addrOpen, setAddrOpen] = useState(false);
//
//   <button onClick={() => setAddrOpen(true)}>주소 검색</button>
//   <AddressSearchModal
//     open={addrOpen}
//     onClose={() => setAddrOpen(false)}
//     onSelect={(data) => setField("address", data.formatted)}
//   />
//
// Embed 모드 사용 이유: 팝업 차단 회피 · 모달 내부 인라인 렌더

import React from "react";
import DaumPostcodeEmbed, { Address } from "react-daum-postcode";
import { Modal } from "../Modal";

// ─── 반환 타입 ────────────────────────────────────────────────────────────────

export interface SelectedAddress {
  /** 5자리 우편번호 */
  zonecode: string;
  /** 도로명 주소 (예: 경기도 오산시 외삼미로 17) */
  roadAddress: string;
  /** 지번 주소 (예: 경기도 오산시 원동 123-4) */
  jibunAddress: string;
  /** 건물명 (없으면 undefined) */
  buildingName?: string;
  /**
   * 자동 조합된 표시용 주소
   * · "{roadAddress} ({buildingName}) [우 {zonecode}]"  — 건물명 있을 때
   * · "{roadAddress} [우 {zonecode}]"                   — 건물명 없을 때
   */
  formatted: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AddressSearchModalProps {
  open: boolean;
  onClose: () => void;
  /** 주소 선택 완료 시 호출 · 자동으로 모달을 닫음 */
  onSelect: (data: SelectedAddress) => void;
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

/**
 * 다음 우편번호 검색 공용 모달
 * - Embed 모드 (팝업 차단 무관)
 * - 데스크탑: 500×600 고정 / 모바일(≤640px): 전체화면
 * - 선택 완료 시 onSelect 호출 후 자동 닫힘
 */
export const AddressSearchModal: React.FC<AddressSearchModalProps> = ({
  open,
  onClose,
  onSelect,
}) => {
  const handleComplete = (data: Address) => {
    const bname = data.buildingName?.trim() || undefined;
    const road  = data.roadAddress   || data.autoRoadAddress   || "";
    const zone  = data.zonecode      || "";

    const formatted = bname
      ? `${road} (${bname}) [우 ${zone}]`
      : `${road} [우 ${zone}]`;

    onSelect({
      zonecode:     zone,
      roadAddress:  road,
      jibunAddress: data.jibunAddress || data.autoJibunAddress || "",
      buildingName: bname,
      formatted,
    });

    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="주소 검색"
      size="sm"
      // 패딩 없이 DaumPostcodeEmbed 가 꽉 채우도록
      className="!p-0 overflow-hidden"
    >
      {/*
        DaumPostcodeEmbed 는 style prop 으로 크기 지정 필요.
        모바일(≤640) 에서는 100vw × 100dvh 대신 Modal full 처리에 맡김.
      */}
      <DaumPostcodeEmbed
        onComplete={handleComplete}
        style={{ width: "100%", height: "500px", minHeight: "380px" }}
        autoClose={false}
      />
    </Modal>
  );
};

export default AddressSearchModal;
