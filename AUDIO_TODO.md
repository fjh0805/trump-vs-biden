# 🎵 音频素材待办清单

## 已完成 ✅
- [x] bgm.mp3 - 进行曲 (已有)
- [x] bgm-charge.mp3 - 冲击进行曲 (已有)
- [x] 代码已改为 YMCA (src/client/bgm.ts, index.html)

## 待下载 🔴

### 1. YMCA 主题曲 (bgm-ymca.mp3)
**目标**: Village People 的 YMCA 经典曲目

**推荐来源**:
- Internet Archive: https://archive.org/details/village-people-ymca-official-music-video-1978
- 下载步骤:
  1. 点击 "VBR MP3" 或 "Ogg Vorbis" 下载
  2. 重命名为 `bgm-ymca.mp3`
  3. 放到 `public/assets/` 目录

### 2. 特朗普原声破城音效 (sfx-capture-trump.mp3)
**目标**: 特朗普的标志性短语,0.5-1.5秒

**推荐短语**:
- "Tremendous!"
- "We're gonna win!"
- "Make America Great Again!"
- "You're fired!"

**推荐来源**:
1. **MyInstants** (最简单): https://www.myinstants.com/en/search/?name=trump
   - 搜索 "trump tremendous" 或 "trump winning"
   - 点击音效右下角下载图标
   - 重命名为 `sfx-capture-trump.mp3`

2. **Internet Archive**: https://archive.org/details/youtube-tm1ZD9hFPO4
   - 下载完整音频
   - 用 Audacity 或 ffmpeg 剪辑精彩片段

3. **YouTube 剪辑**:
   - 搜索 "Trump Tremendous compilation"
   - 用 yt-dlp 下载: `yt-dlp -x --audio-format mp3 <URL>`
   - 用 ffmpeg 剪辑: `ffmpeg -i input.mp3 -ss 5 -t 1.5 sfx-capture-trump.mp3`

### 3. 拜登原声破城音效 (sfx-capture-biden.mp3)
**目标**: 拜登的标志性短语,0.5-1.5秒

**推荐短语**:
- "Come on, man!"
- "Let's go!"
- "We can do this!"
- "Here's the deal"

**推荐来源**:
1. **MyInstants** (最简单): https://www.myinstants.com/en/search/?name=biden
   - 搜索 "biden come on man"
   - 点击下载
   - 重命名为 `sfx-capture-biden.mp3`

2. **C-SPAN**: https://www.c-span.org/video/?c4820357/hd-2238-biden
   - 下载视频
   - 提取音频: `ffmpeg -i video.mp4 audio.mp3`
   - 剪辑片段: `ffmpeg -i audio.mp3 -ss 30 -t 1.5 sfx-capture-biden.mp3`

## 🛠️ 快速工具

### 使用 yt-dlp 下载 YouTube 音频
```bash
# 安装 yt-dlp
brew install yt-dlp

# 下载音频
yt-dlp -x --audio-format mp3 -o "trump.mp3" "https://www.youtube.com/watch?v=<VIDEO_ID>"
```

### 使用 ffmpeg 剪辑音频
```bash
# 剪辑片段 (从第 5 秒开始,持续 1.5 秒)
ffmpeg -i input.mp3 -ss 5 -t 1.5 -acodec copy output.mp3

# 调整音量 (1.5 倍)
ffmpeg -i input.mp3 -filter:a "volume=1.5" output.mp3

# 淡入淡出效果
ffmpeg -i input.mp3 -af "afade=t=in:st=0:d=0.1,afade=t=out:st=1.4:d=0.1" output.mp3
```

### 使用 Audacity (可视化编辑)
1. 下载: https://www.audacityteam.org/
2. 打开音频文件
3. 选择精彩片段 (放大波形找高峰处)
4. 效果 > 淡入淡出
5. 文件 > 导出 > 导出为 MP3

## 📋 验证

下载完成后验证:
```bash
cd public/assets
ls -lh bgm-ymca.mp3 sfx-capture-trump.mp3 sfx-capture-biden.mp3

# 播放测试
afplay bgm-ymca.mp3 &
sleep 5
killall afplay

afplay sfx-capture-trump.mp3
afplay sfx-capture-biden.mp3
```

## 🎯 当前状态

- ❌ bgm-ymca.mp3 - 暂用 bgm.mp3 的副本,需替换为真正的 YMCA
- ❌ sfx-capture-trump.mp3 - 暂用 TTS 生成,不够真实
- ❌ sfx-capture-biden.mp3 - 暂用 TTS 生成,不够真实

**建议**: 优先去 MyInstants 下载音效,最快!
