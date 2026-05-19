# Braille、Sixel、Kitty Graphics Protocol 是什么？

在终端视频工具里，可以把渲染方式分成两大类：

1. **字符渲染**
   - ASCII
   - Block 字符
   - Braille
   - Half-block + ANSI 颜色

2. **终端图像协议**
   - Sixel
   - Kitty Graphics Protocol
   - iTerm2 Inline Image Protocol

其中，Braille 仍然属于字符渲染；Sixel 和 Kitty Graphics Protocol 已经更接近“在终端里显示图片”。

---

## 1. Braille：细节模式

Braille 是 Unicode 里的盲文点阵字符，例如：

```text
⠁ ⠃ ⠇ ⡇ ⣿
```

它的特点是：

```text
一个 Braille 字符 = 2 × 4 个点阵
```

也就是说，一个字符格里可以塞下 8 个小点。

普通 ASCII 渲染大概是：

```text
一个字符 ≈ 一个灰度块
```

Braille 渲染则是：

```text
一个字符 ≈ 2 × 4 个黑白小像素
```

所以它比普通 ASCII 更适合表现细节、轮廓和线条。

---

## 2. Braille 的基本原理

可以把图像切成一个个 `2 × 4` 的小块：

```text
1 4
2 5
3 6
7 8
```

每个位置对应 Braille 字符里的一个点。

如果某个位置亮，就把对应的点打开；如果不亮，就关闭。

全部点亮时：

```text
⣿
```

全部为空时：

```text
⠀
```

所以 Braille 很适合做：

```bash
--mode braille
```

适用场景：

- 黑白高细节画面
- 线稿
- 边缘检测效果
- 漫画风画面
- 低带宽终端显示

缺点：

- 灰度表现不如 block 字符自然
- 彩色表现不如 half-block + truecolor
- 视频动态画面可能有轻微闪烁
- 不同终端字体下效果可能有差异

---

## 3. Sixel：终端里的位图图像协议

Sixel 不是普通字符画。

它是一种比较老的终端图像协议，可以通过特殊的 escape sequence，把图像数据发送给 terminal，让 terminal 直接绘制图片。

简单理解：

```text
ASCII / Braille / Block：
输出的是字符，终端负责显示字符。

Sixel：
输出的是图像编码数据，终端把它当 bitmap image 来画。
```

Sixel 的名字来自 “six pixels”，它的基本单元大致可以理解成：

```text
1 像素宽 × 6 像素高
```

所以它不是用字符密度模拟图像，而是直接向终端传递图像数据。

适用场景：

```bash
--mode sixel
```

优点：

- 画质比字符画更接近真实图片
- 可以在终端中显示 inline image
- 一些传统终端和现代终端支持

缺点：

- 不是所有终端都支持
- 协议相对老
- 做视频时数据量较大
- 刷新策略需要认真设计，否则容易卡顿或闪烁

---

## 4. Kitty Graphics Protocol：现代终端图像协议

Kitty Graphics Protocol 是 kitty 终端提出的一套现代终端图像协议。

它的目标是让终端程序可以绘制真正的像素图像，而不是只靠字符模拟图像。

简单理解：

```text
Kitty Graphics Protocol = 在 terminal 里传输和显示图片的一套现代协议
```

它通常可以支持：

- PNG
- RGB / RGBA 数据
- 更好的颜色表现
- 透明度
- 图像定位
- 更灵活的图像更新方式

适用场景：

```bash
--mode kitty
```

优点：

- 画质高
- 更接近真实图片显示
- 比传统字符渲染更像 GUI 图像
- 适合现代终端环境

缺点：

- 主要依赖支持该协议的终端
- 兼容性不如 ASCII / Braille / Half-block
- 已经不算严格意义上的“字符流渲染”
- 如果你的产品定位是字符视频工具，一开始不建议强依赖它

---

## 5. Half-block：主力推荐模式

在终端视频工具里，我最推荐的主力模式不是 Braille，也不是 Sixel，而是：

```text
ANSI truecolor + half-block
```

核心字符是：

```text
▀
```

这个字符表示上半块。

一个终端字符格可以被拆成上下两个像素：

```text
上半像素：前景色
下半像素：背景色
字符：▀
```

输出形式大概是：

```text
\x1b[38;2;R1;G1;B1m\x1b[48;2;R2;G2;B2m▀
```

其中：

```text
38;2 = truecolor 前景色
48;2 = truecolor 背景色
```

也就是说，一个字符格可以同时表达上下两个不同颜色的像素。

适用场景：

```bash
--mode half
```

优点：

- 兼容性较好
- 彩色表现好
- 分辨率比普通字符模式高
- 工程实现比 Sixel / Kitty 简单
- 很适合作为 terminal video renderer 的默认模式

---

## 6. 几种模式的对比

| 模式 | 本质 | 兼容性 | 画质 | 是否属于字符画 |
|---|---|---:|---:|---|
| ASCII | 普通字符密度 | 最高 | 低 | 是 |
| Block | 块字符灰度 | 高 | 中 | 是 |
| Braille | Unicode 点阵字符 | 高 | 中 | 是 |
| Half-block + ANSI | Unicode 半块字符 + 颜色 | 高 | 高 | 是 |
| Sixel | 终端位图协议 | 中 | 高 | 不完全是 |
| Kitty Graphics Protocol | 现代终端图像协议 | 中低 | 很高 | 不是 |

---

## 7. 推荐的产品分层

如果要做一个 terminal 视频工具，可以按下面的方式设计：

```text
基础兼容层：
ASCII / Block / Braille

主力效果层：
ANSI truecolor + half-block

增强图像层：
Sixel / Kitty Graphics Protocol
```

命令可以设计成：

```bash
termvideo play demo.mp4 --mode ascii
termvideo play demo.mp4 --mode block
termvideo play demo.mp4 --mode braille
termvideo play demo.mp4 --mode half
termvideo play demo.mp4 --mode sixel
termvideo play demo.mp4 --mode kitty
```

---

## 8. 推荐的 MVP

第一版建议先做：

```text
ffmpeg 解码视频
→ 输出 RGB raw frame
→ 根据 terminal 尺寸缩放
→ 每 2 行像素合并成 1 行字符
→ 用 truecolor + ▀ 渲染
```

也就是：

```bash
--mode half
```

这是最适合作为默认模式的方案。

原因：

- 效果明显好于纯 ASCII
- 实现难度低于 Sixel / Kitty
- 兼容性好于终端图像协议
- 仍然保留“字符流视频”的味道
- 后续可以自然扩展到 Braille、Sixel、Kitty

---

## 9. 建议的定位

不要把产品定位成：

```text
ASCII Video Player
```

这个方向已经比较常见，而且上限不高。

更好的定位是：

```text
Terminal Pixel Renderer
```

或者：

```text
ANSI / Unicode Terminal Video Renderer
```

中文可以叫：

```text
基于 ANSI 与 Unicode 字符的终端像素渲染器
```

一句话说明：

> 一个面向现代终端的字符流视频播放器，用 ANSI truecolor、Unicode block 和 Braille，在不依赖 GUI 的情况下播放高质量视频。

---

## 10. 实现优先级建议

建议顺序：

```text
1. half-block + truecolor
2. ASCII 灰度模式
3. Braille 细节模式
4. Block 灰度模式
5. 音频同步
6. 终端能力检测
7. Sixel 增强模式
8. Kitty Graphics Protocol 增强模式
```

不要一开始就押宝 Sixel / Kitty。

它们画质更强，但兼容性和工程复杂度更高。第一版应该先把字符渲染体验做好。

---

## 11. 最终建议

核心路线：

```text
half-block + truecolor 作为默认渲染模式
Braille 作为细节模式
ASCII 作为兼容模式
Sixel / Kitty 作为增强模式
```

这样产品既有复古字符视频的味道，又能利用现代终端的颜色和图像能力。
