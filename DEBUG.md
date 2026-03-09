# 🐛 预加载功能调试指南

## 问题排查

### 1️⃣ 检查浏览器 Console

按 **F12** 打开开发者工具，看 Console 有没有这些日志：

**正常情况：**
```
✅ 图片预加载完成：https://cards.scryfall.io/...
✅ 使用缓存图片：https://cards.scryfall.io/...
```

**异常情况：**
```
❌ 图片预加载失败：... (错误信息)
代理失败：https://api.allorigins.win/raw?url=...
所有代理都失败了
```

### 2️⃣ 检查变量

在 Console 输入：
```javascript
// 查看缓存
imageCache

// 查看正在加载的
imageLoading

// 手动测试预加载
preloadCardImage('https://cards.scryfall.io/normal/big/36.jpg')
```

### 3️⃣ 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 看不到⏳动画 | CSS 没更新 | 强制刷新 `Ctrl+Shift+R` |
| 点开还是慢 | 预加载失败 | 看 Console 错误 |
| 完全没反应 | JS 报错 | 检查 Console 红色错误 |
| CDN 访问慢 | 网络问题 | 用本地测试 `localhost:8082` |

### 4️⃣ 本地测试（推荐）

```bash
cd ~/.openclaw/workspace/buying-list
python3 -m http.server 8082
```

访问：http://localhost:8082

这样没有 CDN 缓存，能立即看到最新代码效果！

---

*创建时间：2026-03-09 18:24*
