# 码支付卡密铺

一个 Next.js + React + shadcn 风格组件的简单卡网示例。首页有预置商品，默认金额 `0.10` 元；点击购买后创建 PG 订单，并跳转到码支付页面。

## 环境变量

复制 `.env.example` 为 `.env.local`，并填写：

- `MAPAY_PID`: 码支付商户 ID
- `MAPAY_KEY`: 码支付商户密钥
- `MAPAY_GATEWAY`: 默认 `https://mzf.mapay.cc/xpay/epay/submit.php`
- `APP_URL`: 支付回调可访问的站点地址，本地调试为 `http://localhost:3000`
- `POSTGRES_*`: PG 连接信息

## 本地运行

```bash
npm install
npm run dev
```

## 支付回调

- 异步通知：`/api/pay/notify`
- 页面跳转：`/pay/return`

异步通知验签成功且 `trade_status=TRADE_SUCCESS` 后会把订单状态更新为 `paid`，并返回 `success` 给码支付。
