import React from "react";
import { ReconcilePanel } from "../components/ReconcilePanel";

/**
 * ReconcilePage
 * - 카드 청구 대조/명세서 기능은 ReconcilePanel이 담당
 * - 이 페이지는 라우팅/레이아웃만 담당해서 TS 문법/인코딩 이슈를 원천 차단
 */
export function ReconcilePage() {
  return (
    <div className="container" style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <ReconcilePanel />
    </div>
  );
}

export default ReconcilePage;
