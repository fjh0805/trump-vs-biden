# 音频资源说明

本项目需要以下音频文件来提供完整的游戏体验:

## BGM 背景音乐

1. **`bgm.mp3`** - 进行曲主题
   - 已有,公有领域进行曲

2. **`bgm-charge.mp3`** - 冲击主题  
   - 已有,公有领域冲击音乐

3. **`bgm-mega.mp3`** - MEGA 主题 ⚠️ **需要添加**
   - 建议时长: 2-4 分钟
   - 风格: 竞选集会主题/激昂进行曲
   - 版权: 公有领域或已授权音乐
   - 参考: 可使用公开的竞选风格音乐片段(不使用受版权保护的原曲)

## SFX 音效

4. **`sfx-capture-trump.mp3`** - 特朗普破城语音 ⚠️ **需要添加**
   - 时长: 0.5-1.5 秒
   - 内容: 短促有力的喊叫/口号片段
   - 示例: "Yeah!", "We win!", "Tremendous!" 等经典语录
   - 版权: 公有领域的演讲片段或合成音频

5. **`sfx-capture-biden.mp3`** - 拜登破城语音 ⚠️ **需要添加**
   - 时长: 0.5-1.5 秒
   - 内容: 短促有力的喊叫/口号片段
   - 示例: "Come on!", "We did it!", "Let's go!" 等经典语录
   - 版权: 公有领域的演讲片段或合成音频

## 降级方案

代码已经实现了优雅的降级机制:
- 如果 `bgm-mega.mp3` 不存在,用户无法选择该选项,但不会报错
- 如果破城语音文件缺失,自动回退到合成音效(原有的 formant yell + thump)

## 临时占位文件(开发用)

可以先创建静音占位文件来测试功能:

```bash
# macOS/Linux
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 3 -acodec libmp3lame public/assets/bgm-mega.mp3
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -acodec libmp3lame public/assets/sfx-capture-trump.mp3
ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 1 -acodec libmp3lame public/assets/sfx-capture-biden.mp3
```

或使用在线工具生成:
- https://www.audacityteam.org/ (免费音频编辑器)
- https://ttsmaker.com/ (文字转语音)
- https://freesound.org/ (免费音效库,需要公有领域标签)

## 版权注意事项

⚠️ **重要**: 
- 不要使用未授权的受版权保护的音乐
- 竞选演讲的公开片段通常属于公有领域(美国联邦政府作品)
- 合成音频/TTS 生成的语音可以自由使用
- 线上部署前确认所有音频资源的使用许可

---

**当前状态**: 游戏可以正常运行,音效系统会自动降级到合成音效
