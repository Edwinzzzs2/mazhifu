# 码支付卡密铺

一个 Next.js + React + shadcn 风格组件的简单卡网示例。首页有预置商品，默认金额 `0.10` 元；点击购买后创建 PG 订单，先进入站内订单确认页，再跳转到码支付页面。

## 环境变量

复制 `.env.example` 为 `.env.local`，并填写：

- `MAPAY_PID`: 码支付商户 ID
- `MAPAY_KEY`: 码支付商户密钥
- `MAPAY_GATEWAY`: 默认 `https://mzf.mapay.cc/xpay/epay/submit.php`
- `MAPAY_CHANNEL_ID`: 可选，码支付后台指定通道 ID
- `MAPAY_DEVICE`: 可选，设备类型，例如 `pc`、`mobile`、`alipay`
- `APP_URL`: 支付回调可访问的站点地址，本地调试为 `http://localhost:3000`
- `CARD_SECRET_ENCRYPTION_KEY`: 卡密加密密钥，配置后不要更换，否则旧卡密无法解密
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

## 后台与卡密

- 后台地址：`/admin`
- 登录方式：首次访问会创建管理员账号，之后使用用户名和密码登录；后台认证使用短期 access token 和 HttpOnly refresh token
- 账号控制：后台“设置”里可关闭注册、关闭普通用户密码登录、禁止修改用户名
- 商品库存来自可用卡密数量，不能手工改库存
- 卡密导入支持手工粘贴、TXT 文件和 CSV 文件；TXT 按一行一张卡密，CSV 读取每行第一列

下单时会先预占卡密，订单过期会释放预占；支付成功后会把预占卡密标记为已售，并在订单页展示给用户。
