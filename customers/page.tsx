"use client";

export default function CustomersPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#06192f",
        color: "white",
        padding: 40,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ fontSize: 42 }}>
          客戶資料庫 CRM
        </h1>

        <button
          style={{
            background: "#facc15",
            color: "#000",
            border: "none",
            padding: "12px 20px",
            borderRadius: 12,
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          + 新增客戶
        </button>
      </div>

      <div
        style={{
          marginTop: 40,
          background: "#102742",
          padding: 24,
          borderRadius: 16,
        }}
      >
        <h2>測試客戶</h2>

        <p>公司：FONG GROUP</p>

        <p>電話：0912345678</p>

        <p>LINE：@fong</p>

        <p>成交率：90%</p>

        <p>預估金額：NT$ 300,000</p>
      </div>
    </main>
  );
}