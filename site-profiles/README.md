# site-profiles

用于存放站点 API 返回值覆盖配置（`siteProfile` JSON）。

推荐命名：

- `jd.json`
- `site-profile.jd.json`
- `xxx.json`

运行示例：

```bash
node run-work-leapvm.js --file h5st.js --site-profile jd
node run-work-leapvm.js --file h5st.js --site-profile site-profiles/jd.json
```

说明：

- `run-work-leapvm.js` 会优先按你传入的路径查找。
- 若传入的是简名（如 `jd` / `jd.json`），会继续在根目录 `site-profiles/`（以及 `work/site-profiles/` 兼容目录）中查找。
- 配置结构见 `leap_manual/architecture/站点API返回值覆盖与任务态注入.md`。
