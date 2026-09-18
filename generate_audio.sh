#!/bin/bash
# 快速生成游戏音频素材

cd /Users/jamsoul/Codes/chore/trump-vs-biden/public/assets

echo "🎵 开始生成音频素材..."

# 检查 ffmpeg 是否安装
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  ffmpeg 未安装，正在安装..."
    brew install ffmpeg
fi

# 1. 生成特朗普风格语音
echo "🎤 生成特朗普破城音效..."
say -v Daniel -r 200 "Tremendous!" -o trump_temp.aiff
ffmpeg -i trump_temp.aiff -acodec libmp3lame -ar 44100 -b:a 192k sfx-capture-trump.mp3 -y 2>/dev/null
rm trump_temp.aiff

# 2. 生成拜登风格语音  
echo "🎤 生成拜登破城音效..."
say -v Alex -r 180 "Come on!" -o biden_temp.aiff
ffmpeg -i biden_temp.aiff -acodec libmp3lame -ar 44100 -b:a 192k sfx-capture-biden.mp3 -y 2>/dev/null
rm biden_temp.aiff

# 3. 使用现有 bgm.mp3 复制为 MEGA 主题 (临时方案)
if [ ! -f bgm-mega.mp3 ]; then
    echo "🎵 创建 MEGA BGM (使用现有进行曲)..."
    cp bgm.mp3 bgm-mega.mp3
fi

echo ""
echo "✅ 音频素材生成完成!"
echo ""
echo "📋 生成的文件:"
ls -lh sfx-capture-*.mp3 bgm-mega.mp3 2>/dev/null || echo "   部分文件生成失败"
echo ""
echo "🎮 现在可以运行游戏测试音效:"
echo "   npm run dev"

