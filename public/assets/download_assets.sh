#!/bin/bash
# 下载游戏音频素材脚本

cd public/assets

echo "📥 开始下载音频素材..."

# 1. 下载 MEGA 主题音乐 (从 Pixabay 获取爱国主题音乐)
echo "🎵 下载 MEGA BGM..."
curl -L "https://cdn.pixabay.com/download/audio/2022/03/10/audio_d1718ab41f.mp3" -o bgm-mega.mp3 || echo "⚠️  MEGA BGM 需要手动下载"

# 2. 创建临时音效文件说明
cat > DOWNLOAD_INSTRUCTIONS.md << 'INST'
# 音频素材下载指南

由于版权和直链限制,请手动下载以下文件:

## 🎵 MEGA BGM (bgm-mega.mp3)
**推荐来源**:
1. Pixabay 爱国主题: https://pixabay.com/music/search/patriotic/
   - 搜索 "epic patriotic" 或 "march"
   - 选择 2-4 分钟的激昂进行曲
   - 下载后重命名为 `bgm-mega.mp3`

2. 或使用 Internet Archive: https://archive.org/details/audio
   - 搜索 "patriotic march" 或 "rally music"

## 🎤 特朗普破城语音 (sfx-capture-trump.mp3)
**推荐来源**:
1. MyInstants: https://www.myinstants.com/en/instant/we-will-make-america-great-again-83257/
   - 点击右侧下载按钮
   - 重命名为 `sfx-capture-trump.mp3`

2. Internet Archive: https://archive.org/details/youtube-tm1ZD9hFPO4
   - 下载音频
   - 使用 Audacity 剪辑 0.5-1.5 秒的片段 (如 "Great!", "Tremendous!")

3. Voicemod: https://tuna.voicemod.net/sound/5b16f553-572d-470b-9c04-67dee42c4438

## 🎤 拜登破城语音 (sfx-capture-biden.mp3)
**推荐来源**:
1. C-SPAN 演讲录音: https://www.c-span.org/video/?c4820357/hd-2238-biden
   - 下载视频后提取音频
   - 剪辑短促有力的片段 (如 "Come on!", "Let's go!")

2. Mason Votes: https://masonvotes.gmu.edu/audio-from-joe-and-jill-biden-sterling-rally/
   - 下载集会音频
   - 使用 Audacity 剪辑精彩片段

## 🛠️ 剪辑工具

### 使用 ffmpeg (推荐)
```bash
# 安装 ffmpeg
brew install ffmpeg

# 剪辑音频片段 (从 5 秒开始,持续 1 秒)
ffmpeg -i input.mp3 -ss 5 -t 1 -acodec copy output.mp3

# 调整音量
ffmpeg -i input.mp3 -filter:a "volume=1.5" output.mp3
```

### 使用 Audacity (可视化编辑)
1. 下载: https://www.audacityteam.org/
2. 打开音频文件
3. 选择精彩片段
4. 文件 > 导出 > 导出为 MP3

## ⚡ 快速方案 - 使用 TTS (文字转语音)

如果找不到合适的原声,可以用 TTS 生成:

### ElevenLabs (推荐,声音质量最好)
https://elevenlabs.io/
- 免费额度: 10,000 字符/月
- 选择 "American Male" 声音
- 特朗普: "Tremendous! We're winning!"
- 拜登: "Come on, let's go!"

### Google Cloud TTS
```bash
# 使用 Google TTS API (需要 API key)
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "input":{"text":"Tremendous!"},
    "voice":{"languageCode":"en-US","name":"en-US-Standard-B"},
    "audioConfig":{"audioEncoding":"MP3"}
  }' "https://texttospeech.googleapis.com/v1/text:synthesize" > trump.json

# 提取 base64 音频并解码
cat trump.json | jq -r '.audioContent' | base64 --decode > sfx-capture-trump.mp3
```

## 📋 文件检查

下载完成后,使用以下命令验证:

```bash
cd public/assets
ls -lh *.mp3
file *.mp3
```

应该看到:
- bgm-mega.mp3 (约 2-5 MB)
- sfx-capture-trump.mp3 (约 20-100 KB)
- sfx-capture-biden.mp3 (约 20-100 KB)
INST

cat DOWNLOAD_INSTRUCTIONS.md

echo ""
echo "✅ 下载脚本完成!"
echo "📄 详细说明已保存到: public/assets/DOWNLOAD_INSTRUCTIONS.md"
echo ""
echo "🎯 下一步:"
echo "1. 按照 DOWNLOAD_INSTRUCTIONS.md 的指引手动下载音频文件"
echo "2. 或者使用下面的快速命令直接从推荐源下载"
