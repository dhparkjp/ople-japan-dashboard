// ★ 데이터 접근부 — 이 파일이 유일한 데이터 진입점이다.
// 지금은 data/*.json(가상 데이터)을 읽지만, 실서비스 전환 시
// 이 한 곳만 실제 API/Export 연동으로 바꾸면 화면·분석은 그대로 동작한다.

const FILES = ["products", "customers", "orders", "subscriptions", "meta"];

export async function loadAll() {
  const base = "data/";
  const results = await Promise.all(
    FILES.map((name) =>
      fetch(`${base}${name}.json`).then((r) => {
        if (!r.ok) throw new Error(`${name}.json 로드 실패 (${r.status})`);
        return r.json();
      })
    )
  );
  const [products, customers, orders, subscriptions, meta] = results;

  // 자주 쓰는 인덱스/파생 컬렉션을 한 번만 만들어 둔다.
  const productById = Object.fromEntries(products.map((p) => [p.id, p]));
  const customerById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const ownOrders = orders.filter((o) => o.channel === "own");
  const marketplaceOrders = orders.filter((o) => o.channel !== "own");

  return {
    products,
    customers,
    orders,
    subscriptions,
    meta,
    productById,
    customerById,
    ownOrders,
    marketplaceOrders,
  };
}
