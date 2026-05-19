import os
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import json

# ----------------- 配置 -----------------
DATA_DIR = "custom_dataset"
MODEL_SAVE_PATH = "custom_model.pth"
VOCAB_SAVE_PATH = "custom_vocab.json"
FRAMES_PER_SAMPLE = 30  # 确保这个变量在全局被定义
EPOCHS = 100  # 增加训练轮数
BATCH_SIZE = 16 # 增大 batch size 让梯度更平滑
LEARNING_RATE = 0.001

# ----------------- 数据标准化函数 -----------------
def normalize_data(data_array):
    """
    将所有坐标点减去手腕的坐标，实现空间位置不变性
    data_array shape: (frames, 126)
    """
    norm_data = np.zeros_like(data_array)
    for i in range(data_array.shape[0]):
        lx, ly, lz = data_array[i, 0], data_array[i, 1], data_array[i, 2]
        rx, ry, rz = data_array[i, 63], data_array[i, 64], data_array[i, 65]
        
        for j in range(21):
            if lx != 0 or ly != 0:
                norm_data[i, j*3]   = data_array[i, j*3] - lx
                norm_data[i, j*3+1] = data_array[i, j*3+1] - ly
                norm_data[i, j*3+2] = data_array[i, j*3+2] - lz
            if rx != 0 or ry != 0:
                norm_data[i, 63+j*3]   = data_array[i, 63+j*3] - rx
                norm_data[i, 63+j*3+1] = data_array[i, 63+j*3+1] - ry
                norm_data[i, 63+j*3+2] = data_array[i, 63+j*3+2] - rz
    return norm_data

# ----------------- 1. 数据集定义 -----------------
class CustomSignDataset(Dataset):
    def __init__(self, data_dir):
        self.samples = []
        self.labels = []
        self.vocab = []
        
        # 扫描目录建立词表
        for word in sorted(os.listdir(data_dir)):
            word_path = os.path.join(data_dir, word)
            if os.path.isdir(word_path):
                self.vocab.append(word)
                
        # 加载所有 numpy 特征
        for label_idx, word in enumerate(self.vocab):
            word_path = os.path.join(data_dir, word)
            for file_name in os.listdir(word_path):
                if file_name.endswith('.npy'):
                    npy_path = os.path.join(word_path, file_name)
                    data = np.load(npy_path)
                    
                    # 自动兼容旧的 60 帧数据和新的 30 帧数据
                    if data.shape[0] == 60:
                        # 简单的降采样：每隔一帧取一帧
                        data = data[::2, :]
                    elif data.shape[0] != FRAMES_PER_SAMPLE:
                        print(f"⚠️ 警告：跳过形状异常的样本 {npy_path}，形状为 {data.shape}")
                        continue
                        
                    # 对特征进行空间标准化（消除屏幕位置影响）
                    data = normalize_data(data)
                        
                    self.samples.append(data)
                    self.labels.append(label_idx)
                    
        print(f"✅ 数据加载完成！共找到 {len(self.samples)} 个样本，词表大小：{len(self.vocab)}")
        
        # 保存词表给推理阶段用
        with open(VOCAB_SAVE_PATH, 'w', encoding='utf-8') as f:
            json.dump(self.vocab, f, ensure_ascii=False)

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        # 转换为 FloatTensor 和 LongTensor
        x = torch.FloatTensor(self.samples[idx])
        y = torch.LongTensor([self.labels[idx]])[0]
        return x, y

# ----------------- 2. 轻量级神经网络 -----------------
class TinySignModel(nn.Module):
    def __init__(self, num_classes):
        super(TinySignModel, self).__init__()
        # 增加网络容量，提取更复杂的特征
        self.conv1 = nn.Conv1d(in_channels=126, out_channels=128, kernel_size=3, padding=1)
        self.relu = nn.ReLU()
        self.pool = nn.MaxPool1d(2)
        
        self.conv2 = nn.Conv1d(in_channels=128, out_channels=256, kernel_size=3, padding=1)
        
        # LSTM 层增加维度和层数
        self.lstm = nn.LSTM(input_size=256, hidden_size=128, num_layers=2, batch_first=True, dropout=0.2)
        
        # 增加 Dropout 防止过拟合
        self.dropout = nn.Dropout(0.5)
        self.fc = nn.Linear(128, num_classes)

    def forward(self, x):
        # x shape: (batch, 30, 126)
        x = x.permute(0, 2, 1)  # 转换为 (batch, 126, 30)
        
        x = self.conv1(x)
        x = self.relu(x)
        x = self.pool(x)
        
        x = self.conv2(x)
        x = self.relu(x)
        
        x = x.permute(0, 2, 1)  # 转换回 (batch, seq_len, features)
        
        lstm_out, (h_n, c_n) = self.lstm(x)
        
        # 取 LSTM 最后一个时间步的输出
        last_out = lstm_out[:, -1, :]
        
        out = self.dropout(last_out)
        out = self.fc(out)
        return out

# ----------------- 3. 训练循环 -----------------
def main():
    dataset = CustomSignDataset(DATA_DIR)
    if len(dataset) == 0:
        print("❌ 错误：在 custom_dataset 里没找到数据，请先运行 record_data.py！")
        return
        
    dataloader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"🚀 使用设备: {device}")
    
    model = TinySignModel(num_classes=len(dataset.vocab)).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)
    
    print("开始训练...")
    for epoch in range(1, EPOCHS + 1):
        model.train()
        total_loss = 0
        correct = 0
        total = 0
        
        for batch_x, batch_y in dataloader:
            batch_x, batch_y = batch_x.to(device), batch_y.to(device)
            
            optimizer.zero_grad()
            outputs = model(batch_x)
            loss = criterion(outputs, batch_y)
            
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            
            # 计算准确率
            _, predicted = torch.max(outputs.data, 1)
            total += batch_y.size(0)
            correct += (predicted == batch_y).sum().item()
            
        avg_loss = total_loss / len(dataloader)
        accuracy = 100 * correct / total
        
        if epoch % 5 == 0 or epoch == 1:
            print(f"Epoch [{epoch}/{EPOCHS}] | Loss: {avg_loss:.4f} | 准确率: {accuracy:.2f}%")
            
    # 保存模型
    torch.save(model.state_dict(), MODEL_SAVE_PATH)
    print(f"🎉 训练大功告成！模型已保存至 {MODEL_SAVE_PATH}")

if __name__ == "__main__":
    main()