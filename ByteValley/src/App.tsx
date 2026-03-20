/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Minus, Square, X, Play, Search, Edit3, Terminal, CheckCircle, Coffee, AlertTriangle, Folder, Bot, Trash2 } from 'lucide-react';

// 🤖 SDK Integration
import {
  initializeGameSDK,
  setGameStateUpdateCallback,
  setUserQuestionCallback,
  answerUserQuestion,
  addSDKAgent,
  removeSDKAgent,
  triggerSDKState,
  executeSDKTask,
  quickSDKQuery,
} from './agent/gameIntegration';
import { exposeTestFunctions, TEST_PROMPTS } from './agent/testTools';

// --- Constants & Types ---
const CANVAS_WIDTH = 1376;
const CANVAS_HEIGHT = 768;

type AgentState = 'IDLE' | 'THINKING' | 'READING' | 'WRITING' | 'EXECUTING' | 'SUCCESS' | 'ERROR' | 'AWAITING_APPROVAL' | 'PLANNING';
type ViewState = 'MAIN' | 'BULLETIN' | 'ROUNDTABLE_CHAT' | 'CLI_CHAT';
type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

// 聊天消息类型
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// 独立的聊天会话（标签页）
interface ChatSession {
  agentId: string;
  messages: ChatMessage[];
  input: string;
  isProcessing: boolean;
  lastActive: number;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: number;
  executionLog?: string[];
  supplementaryInput?: string;
  // 🤖 SDK 相关字段
  agentId?: string;           // 分配的机器人 ID
  sdkPrompt?: string;         // 发送给 SDK 的提示词
  result?: string;            // 执行结果
  error?: string;             // 错误信息
}

interface Zone {
  id: string;
  name: string;
  x: number;       // Center X
  y: number;       // Center Y
  w?: number;      // Width for square zones
  h?: number;      // Height for square zones
  rMin?: number;   // Inner radius for circular zones
  rMax?: number;   // Outer radius for circular zones
}

// 🖼️ The background image will cover the entire canvas
const ZONES: Record<string, Zone> = {
  LIBRARY: { id: 'LIBRARY', name: 'Library', x: 232.5, y: 253, w: 345, h: 200 },
  REST_AREA: { id: 'REST_AREA', name: 'Rest Area', x: 1155, y: 253, w: 330, h: 200 },
  ROUNDTABLE: { id: 'ROUNDTABLE', name: 'Roundtable', x: 690, y: 420, rMin: 140, rMax: 200 },
  WORKSHOP: { id: 'WORKSHOP', name: 'Workshop', x: 264, y: 580, w: 288, h: 240 },
  PROVING_GROUNDS: { id: 'PROVING_GROUNDS', name: 'Server Room', x: 1145, y: 580, w: 390, h: 240 },
};

const INTERACTABLES = {
  BULLETIN_BOARD: { x: 533, y: 40, w: 314, h: 175 }, // (533, 40) ~ (847, 215)
  EMERGENCY_BUTTON: { x: 690, y: 420, radius: 25 }
};

interface Agent {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  state: AgentState;
  speed: number;
  frame: number;
  facing: 'left' | 'right';
  animationVariant: number;
  overrideMode?: 'moving' | 'waiting' | 'dragging' | 'moving_to_emergency';
  color: string;
  message: string;
  overrideTimeout: number | null;
}

// --- Components ---

const BulletinBoard = ({
  tasks,
  onAddTask,
  onClose,
  newTaskTitle,
  setNewTaskTitle,
  expandedTaskId,
  onToggleExpand,
  onUpdateSupplementaryInput,
  agentsData,
  onAssignTask,
  onExecuteTask
}: any) => {
  const statusConfig: Record<TaskStatus, { label: string, color: string }> = {
    TODO: { label: 'TO DO', color: 'bg-blue-500' },
    IN_PROGRESS: { label: 'IN PROGRESS', color: 'bg-orange-500' },
    COMPLETED: { label: 'COMPLETED', color: 'bg-emerald-500' },
    FAILED: { label: 'FAILED', color: 'bg-red-500' }
  };

  return (
    <div 
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-[832px] h-[70vh] bg-cover bg-center shadow-2xl border-4 border-[#3d251e] rounded-lg overflow-hidden flex flex-col"
        style={{ 
          backgroundImage: 'url(/bulletin_board.png)', 
          imageRendering: 'pixelated',
          fontFamily: '"Press Start 2P", cursive'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pixel Art Task UI Overlay */}
        <div className="absolute inset-0 flex flex-col pt-[12vh] pb-8 px-10 md:px-14 bg-black/20">
          <div className="flex justify-end items-center mb-6">
            <button 
              onClick={onClose} 
              className="bg-red-400 hover:bg-red-300 text-white w-8 h-8 flex items-center justify-center border-2 border-red-400 shadow-[2px_2px_0_0_rgba(0,0,0,0.2)] transition-all cursor-pointer active:translate-y-0.5 active:shadow-none"
            >
              <span className="text-[12px] mt-0.5">X</span>
            </button>
          </div>

          {/* New Task Input */}
          <div className="flex flex-col gap-3 mb-6 bg-[#3d2b25]/80 p-3 border-2 border-[#4d352e]">
            <input 
              type="text" 
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Enter new mission..."
              className="w-full bg-black/20 border-2 border-[#4d352e] px-3 py-2 text-[#fef08a] text-[10px] placeholder:text-zinc-500 focus:outline-none"
            />
            <button 
              onClick={onAddTask}
              className="w-full bg-emerald-700 hover:bg-emerald-500 text-white px-4 py-2 border-2 border-emerald-900 text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors"
            >
              POST MISSION
            </button>
          </div>

          {/* Task List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
            <div className="grid gap-3">
              {tasks.map((task: Task) => (
                <div key={task.id} className="bg-[#3d2b25]/80 border-2 border-[#4d352e] p-3 flex flex-col hover:bg-[#4d352e]/90 transition-colors gap-3 cursor-pointer" onClick={() => onToggleExpand(task.id)}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${statusConfig[task.status].color} shadow-[0_0_4px_rgba(255,255,255,0.5)]`} />
                      <span className="text-[10px] font-bold text-[#fef08a]">{task.title}</span>
                    </div>
                    <span className="text-[8px] text-zinc-400">{statusConfig[task.status].label}</span>
                  </div>
                  
                  {expandedTaskId === task.id && (
                    <div className="mt-3 pt-3 border-t-2 border-[#3d251e] flex flex-col gap-4 bg-black/30 -mx-2 px-2 -my-2 py-2 rounded" onClick={(e) => e.stopPropagation()}>
                      {/* 分配机器人 - More prominent */}
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] text-[#fef08a] uppercase font-bold animate-pulse">🤖 ASSIGN AGENT:</label>
                        <div className="flex gap-2 flex-wrap">
                          {agentsData.length === 0 ? (
                            <div className="text-[8px] text-zinc-500 italic">No agents available. Click + button to add one!</div>
                          ) : (
                            agentsData.map((agent) => (
                              <button
                                key={agent.id}
                                onClick={() => onAssignTask && onAssignTask(task.id, agent.id)}
                                className={`px-3 py-2 border-2 text-[10px] transition-all font-bold ${
                                  task.agentId === agent.id
                                    ? 'bg-[#fef08a] border-[#fef08a] text-black shadow-[0_0_8px_rgba(254,240,138,0.5)]'
                                    : 'bg-black/60 border-[#4d352e] text-[#a8a29e] hover:border-[#fef08a] hover:text-[#fef08a]'
                                }`}
                              >
                                {agent.id}
                              </button>
                            ))
                          )}
                          {task.agentId && (
                            <button
                              onClick={() => onAssignTask && onAssignTask(task.id, undefined)}
                              className="px-2 py-1 bg-red-900/50 border-2 border-red-700 text-[8px] text-red-400 hover:bg-red-800/50"
                            >
                              ✕ UNASSIGN
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 执行按钮 - More prominent */}
                      {task.agentId && task.status === 'TODO' && (
                        <button
                          onClick={() => onExecuteTask && onExecuteTask(task)}
                          className="w-full bg-emerald-700 hover:bg-emerald-500 text-white px-4 py-3 border-2 border-emerald-900 text-[12px] font-bold uppercase cursor-pointer transition-colors shadow-[0_4px_0_0_rgba(6,78,59,0.5)] hover:shadow-[0_2px_0_0_rgba(6,78,59,0.5)] hover:translate-y-[2px] active:shadow-none active:translate-y-[4px]"
                        >
                          ▶ EXECUTE MISSION
                        </button>
                      )}

                      {/* 执行日志 */}
                      {task.status !== 'TODO' && (
                        <div className="bg-black/60 p-2 border border-[#3d251e] font-mono text-[8px] leading-relaxed">
                          <div className="text-zinc-500 mb-1">// EXECUTION LOG</div>
                          {task.executionLog?.map((log, i) => (
                            <div key={i} className="mb-0.5 text-emerald-400">{`> ${log}`}</div>
                          ))}
                          {task.result && (
                            <div className="mt-2 pt-2 border-t border-[#3d251e] text-[10px]">
                              <div className="text-zinc-500">RESULT:</div>
                              <div className="text-[#fef08a] break-words">{task.result.slice(0, 200)}...</div>
                            </div>
                          )}
                          {task.error && (
                            <div className="mt-2 pt-2 border-t border-[#3d251e] text-[10px]">
                              <div className="text-red-500">ERROR:</div>
                              <div className="text-red-400 break-words">{task.error}</div>
                            </div>
                          )}
                          {task.status === 'IN_PROGRESS' && <div className="animate-pulse text-yellow-400">⏳ EXECUTING...</div>}
                        </div>
                      )}

                      {/* 补充输入 */}
                      {task.status === 'TODO' && (
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] text-[#a8a29e] uppercase">MISSION DETAILS:</label>
                          <textarea
                            value={task.supplementaryInput || ''}
                            onChange={(e) => onUpdateSupplementaryInput(task.id, e.target.value)}
                            placeholder="Add mission details for the AI..."
                            className="w-full bg-black/60 border-2 border-[#4d352e] p-3 text-[#fef08a] text-[10px] focus:outline-none focus:border-[#fef08a] h-20 resize-none"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const RoundtableChat = ({ onClose }: { onClose: () => void }) => {
  return (
    <div 
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-[600px] h-[500px] bg-zinc-900 shadow-2xl border-4 border-[#3d251e] rounded-lg flex flex-col"
        style={{ imageRendering: 'pixelated', fontFamily: '"Press Start 2P", cursive' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#3d251e] p-3 flex justify-between items-center border-b-4 border-black">
          <h2 className="text-sm font-bold text-[#fef08a] tracking-wider">BRAINSTORMING MODE</h2>
          <button 
            onClick={onClose}
            className="text-[#fef08a] hover:text-red-400 font-bold text-sm"
          >
            [X]
          </button>
        </div>
        
        {/* Chat Area */}
        <div className="flex-1 p-4 overflow-y-auto bg-black/40 flex flex-col gap-4 text-[10px] leading-relaxed">
          <div className="text-zinc-500 italic text-center mb-2">-- ROUNDTABLE SESSION STARTED --</div>
          
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 bg-emerald-900 border-2 border-emerald-500 rounded flex items-center justify-center shrink-0">
              <span className="text-emerald-400 text-xs">🤖</span>
            </div>
            <div className="bg-zinc-800 border-2 border-zinc-700 p-3 rounded-r-lg rounded-bl-lg text-emerald-400">
              All agents are in position. What are we brainstorming today?
            </div>
          </div>
        </div>
        
        {/* Input Area */}
        <div className="p-3 border-t-4 border-[#3d251e] bg-zinc-900 flex gap-2">
          <input 
            type="text" 
            placeholder="Type your idea here..." 
            className="flex-1 bg-black border-2 border-zinc-700 p-3 text-[#fef08a] text-[10px] focus:outline-none focus:border-emerald-500" 
          />
          <button className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[10px] px-4 py-2 border-b-4 border-emerald-900 active:border-b-0 active:translate-y-1">
            SEND
          </button>
        </div>
      </div>
    </div>
  );
};

// Chat Tab Bar - 标签页导航
const ChatTabBar = ({
  sessions,
  activeAgentId,
  onTabClick,
  onCloseTab,
  onNewTab
}: {
  sessions: ChatSession[];
  activeAgentId: string | null;
  onTabClick: (agentId: string) => void;
  onCloseTab: (agentId: string) => void;
  onNewTab: () => void;
}) => {
  return (
    <div className="flex items-center gap-1 bg-[#2d1b15] px-2 py-1 border-b-2 border-black">
      {sessions.map(session => (
        <div
          key={session.agentId}
          className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-[10px] border-2 transition-all ${
            activeAgentId === session.agentId
              ? 'bg-[#fef08a] text-[#2d1b15] border-[#5d4037]'
              : 'bg-[#5d4037] text-[#a1887f] border-transparent hover:bg-[#6d4c41]'
          }`}
          onClick={() => onTabClick(session.agentId)}
        >
          <span>🤖 {session.agentId.slice(0, 8)}</span>
          <span className="text-[8px] opacity-70">({session.messages.length})</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(session.agentId);
            }}
            className="ml-1 hover:text-red-400 font-bold"
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={onNewTab}
        className="px-2 py-1 text-[#a1887f] hover:text-[#fef08a] text-lg font-bold"
        title="Open new chat tab"
      >
        +
      </button>
    </div>
  );
};

// CLI Chat Mode - 支持连续对话（标签页模式）
const CliChatMode = ({
  onClose,
  activeSession,
  onSendMessage,
  onInputChange,
  agentsData,
  onTabClick,
  onCloseTab,
  onNewTab,
  allSessions
}: {
  onClose: () => void;
  activeSession: ChatSession | null;
  onSendMessage: (message: string) => Promise<void>;
  onInputChange: (value: string) => void;
  agentsData: Agent[];
  onTabClick: (agentId: string) => void;
  onCloseTab: (agentId: string) => void;
  onNewTab: () => void;
  allSessions: ChatSession[];
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Extract values from active session
  const messages = activeSession?.messages ?? [];
  const isProcessing = activeSession?.isProcessing ?? false;
  const input = activeSession?.input ?? '';

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    const message = input;
    onInputChange('');
    await onSendMessage(message);
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[800px] h-[600px] bg-zinc-900 shadow-2xl border-4 border-[#3d251e] rounded-lg flex flex-col"
        style={{ imageRendering: 'pixelated', fontFamily: '"Press Start 2P", cursive' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Tab Bar */}
        <div className="bg-[#3d251e]">
          <div className="p-3 flex justify-between items-center">
            <h2 className="text-sm font-bold text-[#fef08a] tracking-wider">🤖 CLI CHAT MODE</h2>
            <button
              onClick={onClose}
              className="text-[#fef08a] hover:text-red-400 font-bold text-sm"
            >
              [X]
            </button>
          </div>
          <ChatTabBar
            sessions={allSessions}
            activeAgentId={activeSession?.agentId ?? null}
            onTabClick={onTabClick}
            onCloseTab={onCloseTab}
            onNewTab={onNewTab}
          />
        </div>

        {/* Chat Area */}
        <div className="flex-1 p-4 overflow-y-auto bg-black/40 flex flex-col gap-3 text-[11px] leading-relaxed">
          {!activeSession ? (
            <div className="text-zinc-500 italic text-center mt-10">
              -- No chat tab open --<br/>
              <span className="text-[9px]">Click the + button to open a new chat tab</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-zinc-500 italic text-center mt-10">
              -- Start a conversation with {activeSession.agentId} --<br/>
              <span className="text-[9px]">Type your message below and press Enter</span>
            </div>
          ) : null}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 border-2 rounded flex items-center justify-center shrink-0 ${
                msg.role === 'user'
                  ? 'bg-blue-900 border-blue-500'
                  : 'bg-emerald-900 border-emerald-500'
              }`}>
                <span className="text-xs">{msg.role === 'user' ? '👤' : '🤖'}</span>
              </div>
              <div className={`max-w-[70%] p-3 ${
                msg.role === 'user'
                  ? 'bg-blue-900/30 border-2 border-blue-700 rounded-l-lg rounded-br-lg text-blue-300'
                  : 'bg-zinc-800 border-2 border-zinc-700 rounded-r-lg rounded-bl-lg text-emerald-400'
              }`}>
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                <div className="text-[8px] text-zinc-600 mt-2">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-emerald-900 border-2 border-emerald-500 rounded flex items-center justify-center shrink-0">
                <span className="text-xs">🤖</span>
              </div>
              <div className="bg-zinc-800 border-2 border-zinc-700 p-3 rounded-r-lg rounded-bl-lg text-emerald-400">
                <div className="flex gap-1">
                  <span className="animate-bounce">●</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
                  <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="p-3 border-t-4 border-[#3d251e] bg-zinc-900 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={activeSession ? "Type your message..." : "Open a tab to start chatting..."}
            disabled={!activeSession || isProcessing}
            className="flex-1 bg-black border-2 border-zinc-700 px-3 py-2 text-[#fef08a] text-[11px] focus:outline-none focus:border-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!activeSession || !input.trim() || isProcessing}
            className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-bold text-[11px] px-4 py-2 border-b-4 border-emerald-900 active:border-b-0 active:translate-y-1"
          >
            SEND
          </button>
        </form>
      </div>
    </div>
  );
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentView, setCurrentView] = useState<ViewState>('MAIN');
  const [approvalAgentId, setApprovalAgentId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [detailedMessageAgentId, setDetailedMessageAgentId] = useState<string | null>(null);
  const [userInput, setUserInput] = useState('');
  // 用户问题状态（与 approval 对话框整合）
  const [pendingQuestions, setPendingQuestions] = useState<Array<{ id: string; question: string; options?: string[]; agentId: string }>>([]);
  const [currentQuestion, setCurrentQuestion] = useState<{ id: string; question: string; options?: string[]; agentId: string } | null>(null);
  // 规划模式状态
  const [pendingPlan, setPendingPlan] = useState<{
    id: string;
    agentId: string;
    task: string;
    steps: Array<{ title: string; description: string; estimatedTime: number }>;
  } | null>(null);
  const [showPlanDialog, setShowPlanDialog] = useState(false);

  // CLI 聊天模式状态 - 标签页模式
  const [chatSessions, setChatSessions] = useState<Map<string, ChatSession>>(new Map());
  const [activeTabAgentId, setActiveTabAgentId] = useState<string | null>(null);
  const [pendingAgentSelection, setPendingAgentSelection] = useState<Agent[] | null>(null);

  // Working Directory - 从 localStorage 加载保存的值
  const [workingDirectory, setWorkingDirectory] = useState(() => {
    const saved = localStorage.getItem('bytevalley-working-dir');
    return saved || 'D:\\work_data\\claude_workspace\\ByteValley'; // Windows 默认路径
  });

  // 保存工作目录到 localStorage
  const saveWorkingDirectory = (dir: string) => {
    localStorage.setItem('bytevalley-working-dir', dir);
    setWorkingDirectory(dir);
    // 同步到 SDK 配置
    try {
      if (typeof window !== 'undefined' && (window as any).require) {
        // Electron 环境 - 更新 SDK 配置
        const { sdkConfig } = require('./agent/sdkConfig');
        sdkConfig.workingDirectory = dir;
      }
    } catch (e) {
      console.log('SDK config update deferred');
    }
  };

  // 浏览目录（仅 Electron）
  const browseDirectory = async () => {
    try {
      console.log('[browseDirectory] Attempting to open directory dialog...');

      // 检查是否在 Electron 环境（有 nodeIntegration）
      if (typeof window !== 'undefined' && (window as any).require) {
        console.log('[browseDirectory] Electron environment detected, using IPC');

        // 使用 IPC 调用主进程的对话框
        const { ipcRenderer } = (window as any).require('electron');
        const result = await ipcRenderer.invoke('select-directory');

        if (result) {
          saveWorkingDirectory(result);
        }
      } else {
        console.warn('[browseDirectory] Not in Electron environment, dialog unavailable');
      }
    } catch (e) {
      console.error('[browseDirectory] Failed:', e);
    }
  };
const [showDirConfig, setShowDirConfig] = useState(false);
  
  // Task Management
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      title: 'Update API Docs',
      description: 'Sync latest API changes',
      status: 'TODO',
      createdAt: Date.now(),
      executionLog: []
    },
  ]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isHoveringInteractable, setIsHoveringInteractable] = useState(false);
  
  // Store loaded images
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const boardImageRef = useRef<HTMLImageElement | null>(null);
  const mousePosRef = useRef({ x: -100, y: -100 });
  const emergencyEndTimeRef = useRef<number>(0);
  const trashRef = useRef<HTMLButtonElement | null>(null);
  const selectedAgentIdRef = useRef<string>('agent-1');

  // Use ref for agent position to avoid re-renders in the animation loop
  const agentsRef = useRef<Agent[]>([{
    id: 'agent-1',
    x: ZONES.ROUNDTABLE.x,
    y: ZONES.ROUNDTABLE.y,
    targetX: ZONES.ROUNDTABLE.x,
    targetY: ZONES.ROUNDTABLE.y,
    state: 'IDLE',
    speed: 150,
    frame: 0,
    facing: 'right',
    animationVariant: 0,
    color: '#b87333',
    message: 'Waiting for tasks...',
    overrideTimeout: null
  }]);
  const [agentsData, setAgentsData] = useState<Agent[]>([...agentsRef.current]);

  // --- Preload Images & SDK Init ---
  useEffect(() => {
    console.log('🖼️ Loading images...');

    const bg = new Image();
    bg.src = '/background.png';
    bg.onload = () => {
      console.log('✅ background.png loaded');
      bgImageRef.current = bg;
    };
    bg.onerror = (e) => { console.error('❌ Failed to load background.png:', e); };

    const board = new Image();
    board.src = '/bulletin_board.png';
    board.onload = () => {
      console.log('✅ bulletin_board.png loaded');
      boardImageRef.current = board;
    };
    board.onerror = (e) => { console.error('❌ Failed to load bulletin_board.png:', e); };

    // 🤖 初始化 SDK 和设置状态更新回调
    const initSDK = async () => {
      try {
        console.log('[App] Initializing SDK...');
        await initializeGameSDK();

        // 为初始的默认机器人创建 SDK
        const colors = ['#b87333', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#ec4899', '#06b6d4'];
        console.log('[App] Registering SDK for initial agents:', agentsRef.current.map(a => a.id));

        for (const agent of agentsRef.current) {
          try {
            await addSDKAgent(agent, colors);
          } catch (error) {
            console.error(`[App] Failed to register SDK for agent ${agent.id}:`, error);
          }
        }

        // 确保UI更新
        setAgentsData([...agentsRef.current]);
        console.log('[App] SDK initialization complete. Agents:', agentsRef.current.map(a => a.id));

        // 暴露测试函数到 window 对象
        exposeTestFunctions(agentsRef.current);

        // 设置状态更新回调 - 当 SDK 触发状态变化时，更新游戏中的机器人
        setGameStateUpdateCallback((agentId: string, state: AgentState, message: string) => {
        const targetAgent = agentsRef.current.find(a => a.id === agentId);
        if (!targetAgent) return;

        if (targetAgent.overrideTimeout) {
          clearTimeout(targetAgent.overrideTimeout);
          targetAgent.overrideTimeout = null;
        }

        targetAgent.state = state;
        targetAgent.message = message;
        targetAgent.overrideMode = undefined;

        const maxVariants = state === 'SUCCESS' ? 4 : 3;
        targetAgent.animationVariant = Math.floor(Math.random() * maxVariants);

        assignZonePosition(targetAgent, state);

        if (state === 'AWAITING_APPROVAL') {
          setApprovalAgentId(targetAgent.id);
        } else if (approvalAgentId === targetAgent.id && currentQuestion) {
          // 状态从 AWAITING_APPROVAL 变为其他状态时，清理问题
          setCurrentQuestion(null);
          setApprovalAgentId(null);
        }

        setAgentsData([...agentsRef.current]);
      });

      // 设置用户问题回调
      setUserQuestionCallback(async (question) => {
        console.log('[App] User question received:', question);

        // 检测是否是规划模式请求
        if (question.question.includes('请将以下任务分解为')) {
          const taskMatch = question.question.match(/任务: (.+)/);
          const task = taskMatch ? taskMatch[1] : question.question;

          // 返回 Promise，等待用户确认计划
          return new Promise((resolve) => {
            setPendingPlan({
              id: question.id,
              agentId: question.agentId,
              task,
              steps: [],  // 初始为空，等待 AI 生成
            });
            setShowPlanDialog(true);

            // 存储 resolve 函数
            (window as any).__planResolver = resolve;
          });
        }

        // 添加到待回答问题列表
        const newQuestion = {
          id: question.id,
          question: question.question,
          options: question.options,
          agentId: question.agentId,
        };
        console.log('[App] Setting question state:', newQuestion);
        setPendingQuestions(prev => [...prev, newQuestion]);

        // 同时设置当前问题（确保对话框能正确显示）
        setCurrentQuestion(newQuestion);

        // 设置 approvalAgentId 以触发整合的对话框
        setApprovalAgentId(question.agentId);

        // 返回 Promise，等待用户回答
        return new Promise((resolve) => {
          console.log('[App] Storing resolver for question:', question.id);
          // 将 resolve 函数存储到 questionId 映射中
          (window as any).__questionResolvers = (window as any).__questionResolvers || {};
          (window as any).__questionResolvers[question.id] = (value: string) => {
            console.log('[App] Resolver function called with:', value);
            resolve(value);
            console.log('[App] Promise.resolve called');
          };
          console.log('[App] Resolver stored at:', question.id);
        });
      });
    } catch (error) {
      console.error('SDK init error:', error);
    }
  };

    initSDK().catch(error => {
      console.error('SDK initialization failed, game will work without SDK:', error);
    });

    // 清理函数
    return () => {
      // SDK 清理逻辑
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (currentView !== 'MAIN') return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Calculate click coordinates relative to canvas internal resolution
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

    // Check if clicked ON any robot (hitbox)
    for (let i = agentsRef.current.length - 1; i >= 0; i--) {
      const agent = agentsRef.current[i];
      const isRobotHit = Math.abs(x - agent.x) < 20 && y > agent.y - 40 && y < agent.y + 10;
      if (isRobotHit) {
        agent.overrideMode = 'dragging';
        selectedAgentIdRef.current = agent.id;
        if (agent.overrideTimeout) {
          clearTimeout(agent.overrideTimeout);
          agent.overrideTimeout = null;
        }
        return;
      }
    }

    // Check if clicked bulletin board
    const bb = INTERACTABLES.BULLETIN_BOARD;
    if (x >= bb.x && x <= bb.x + bb.w && y >= bb.y && y <= bb.y + bb.h) {
      setCurrentView('BULLETIN');
      return;
    }

    // Check if clicked emergency button
    const btn = INTERACTABLES.EMERGENCY_BUTTON;
    const distToBtn = Math.sqrt(Math.pow(x - btn.x, 2) + Math.pow(y - btn.y, 2));
    if (distToBtn <= btn.radius) {
      emergencyEndTimeRef.current = Number.MAX_SAFE_INTEGER; // Flash until arrival
      
      agentsRef.current.forEach(agent => {
        triggerState('THINKING', "BRAINSTORMING MODE INITIATED!", agent.id);
        agent.targetX = btn.x;
        agent.targetY = btn.y + 35;
        agent.overrideMode = 'moving_to_emergency';
        if (agent.overrideTimeout) {
          clearTimeout(agent.overrideTimeout);
          agent.overrideTimeout = null;
        }
      });
      return;
    }

    // Check if clicked in Rest Area
    const rest = ZONES.REST_AREA;
    const isRestArea = x >= rest.x - (rest.w! / 2) && x <= rest.x + (rest.w! / 2) &&
                       y >= rest.y - (rest.h! / 2) && y <= rest.y + (rest.h! / 2);

    if (isRestArea) {
      const selectedAgent = agentsRef.current.find(a => a.id === selectedAgentIdRef.current) || agentsRef.current[0];
      if (selectedAgent) {
        triggerState('SUCCESS', "Taking a break in the Rest Area...", selectedAgent.id);
      }
      return;
    }

    // Move to clicked position (only selected agent)
    const selectedAgent = agentsRef.current.find(a => a.id === selectedAgentIdRef.current) || agentsRef.current[0];
    if (selectedAgent) {
      selectedAgent.targetX = x;
      selectedAgent.targetY = y;
      selectedAgent.overrideMode = 'moving';
      if (selectedAgent.overrideTimeout) {
        clearTimeout(selectedAgent.overrideTimeout);
        selectedAgent.overrideTimeout = null;
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (currentView !== 'MAIN') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
    
    mousePosRef.current = { x, y };

    const draggedAgent = agentsRef.current.find(a => a.overrideMode === 'dragging');
    if (draggedAgent) {
      draggedAgent.x = x;
      draggedAgent.y = y;
      draggedAgent.targetX = x;
      draggedAgent.targetY = y;
    } else {
      const bb = INTERACTABLES.BULLETIN_BOARD;
      const btn = INTERACTABLES.EMERGENCY_BUTTON;
      const isBoard = x >= bb.x && x <= bb.x + bb.w && y >= bb.y && y <= bb.y + bb.h;
      const isBtn = Math.sqrt(Math.pow(x - btn.x, 2) + Math.pow(y - btn.y, 2)) <= btn.radius;
      setIsHoveringInteractable(isBoard || isBtn);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const draggedAgent = agentsRef.current.find(a => a.overrideMode === 'dragging');
    if (draggedAgent) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      // Check if dropped on trash can
      if (trashRef.current) {
        const trashRect = trashRef.current.getBoundingClientRect();
        if (
          e.clientX >= trashRect.left &&
          e.clientX <= trashRect.right &&
          e.clientY >= trashRect.top &&
          e.clientY <= trashRect.bottom
        ) {
          // Delete agent
          // 🤖 清理 SDK 机器人
          removeSDKAgent(draggedAgent.id);
          agentsRef.current = agentsRef.current.filter(a => a.id !== draggedAgent.id);
          setAgentsData([...agentsRef.current]);
          return;
        }
      }

      const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
      const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);

      const rest = ZONES.REST_AREA;
      const isRestArea = x >= rest.x - (rest.w! / 2) && x <= rest.x + (rest.w! / 2) &&
                         y >= rest.y - (rest.h! / 2) && y <= rest.y + (rest.h! / 2);

      if (isRestArea) {
        draggedAgent.overrideMode = undefined;
        triggerState('SUCCESS', "Taking a break in the Rest Area...", draggedAgent.id);
      } else {
        draggedAgent.overrideMode = 'waiting';
        draggedAgent.overrideTimeout = window.setTimeout(() => {
          assignZonePosition(draggedAgent, draggedAgent.state);
          draggedAgent.overrideMode = undefined;
          draggedAgent.overrideTimeout = null;
        }, 2000);
      }
    }
  };

  const addTask = () => {
    if (!newTaskTitle.trim()) return;
    const newTask: Task = {
      id: Math.random().toString(36).substr(2, 9),
      title: newTaskTitle,
      description: 'New assigned mission',
      status: 'TODO',
      createdAt: Date.now(),
      executionLog: []
    };
    setTasks([newTask, ...tasks]);
    setNewTaskTitle('');
  };
  
  const handleUserSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && userInput.trim()) {
      // Simulate interaction
      const input = userInput.trim();
      setUserInput('');
      setDetailedMessageAgentId(null); // Close modal on submit
      
      const agentId = detailedMessageAgentId || agentsRef.current[0].id;
      triggerState('THINKING', `Processing your command: "${input}"...`, agentId);
      
      // Simulate a response after a delay
      setTimeout(() => {
        triggerState('IDLE', `I've acknowledged: "${input}". What's next?`, agentId);
      }, 2000);
    }
  };

  const updateTaskSupplementaryInput = (id: string, input: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, supplementaryInput: input } : t));
  };

  // 🤖 分配任务给机器人
  const assignTaskToAgent = (taskId: string, agentId: string | undefined) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        const updated = { ...t, agentId };
        if (agentId) {
          // 分配机器人，机器人移动到 Roundtable
          const agent = agentsRef.current.find(a => a.id === agentId);
          if (agent) {
            agent.targetX = ZONES.ROUNDTABLE.x;
            agent.targetY = ZONES.ROUNDTABLE.y;
            agent.message = `Assigned: ${t.title}`;
            triggerState('THINKING', `Received mission: ${t.title}`, agentId);
          }
        }
        return updated;
      }
      return t;
    }));
  };

  // 🤖 执行任务
  const executeTask = async (task: Task) => {
    if (!task.agentId) {
      console.error('Task not assigned to any agent');
      return;
    }

    const agent = agentsRef.current.find(a => a.id === task.agentId);
    if (!agent) {
      console.error('Agent not found:', task.agentId);
      return;
    }

    // 更新任务状态
    setTasks(tasks.map(t => {
      if (t.id === task.id) {
        return {
          ...t,
          status: 'IN_PROGRESS' as TaskStatus,
          executionLog: [`[${new Date().toLocaleTimeString()}] Mission started...`]
        };
      }
      return t;
    }));

    try {
      // 构建 SDK 提示词
      const prompt = task.supplementaryInput
        ? `${task.title}\n\nDetails: ${task.supplementaryInput}\n\nPlease complete this task.`
        : `${task.title}\n\n${task.description}`;

      // 机器人状态变化
      triggerState('THINKING', `Starting: ${task.title}...`, task.agentId);

      // 调用 SDK 执行，传递当前工作目录
      const { executeSDKTask } = await import('./agent/gameIntegration');
      const result = await executeSDKTask(task.agentId, task.title, prompt, workingDirectory);

      // 任务完成
      setTasks(tasks.map(t => {
        if (t.id === task.id) {
          return {
            ...t,
            status: 'COMPLETED' as TaskStatus,
            result,
            executionLog: [
            ...(t.executionLog || []),
            `[${new Date().toLocaleTimeString()}] ✓ Mission completed!`,
            `[${new Date().toLocaleTimeString()}] Result: ${result.slice(0, 100)}...`
          ]
          };
        }
        return t;
      }));

      // 机器人进入成功状态
      triggerState('SUCCESS', 'Mission completed!', task.agentId);

    } catch (error: any) {
      // 任务失败
      setTasks(tasks.map(t => {
        if (t.id === task.id) {
          return {
            ...t,
            status: 'FAILED' as TaskStatus,
            error: error.message || 'Unknown error',
            executionLog: [
            ...(t.executionLog || []),
            `[${new Date().toLocaleTimeString()}] ✗ Mission failed: ${error.message}`
          ]
          };
        }
        return t;
      }));

      // 机器人进入错误状态
      triggerState('ERROR', `Mission failed: ${error.message}`, task.agentId);
    }
  };

  // 🤖 CLI Chat Mode - 标签页操作函数
  const openChatTab = (agentId: string) => {
    setChatSessions(prev => {
      const newMap: Map<string, ChatSession> = new Map(prev);
      if (!newMap.has(agentId)) {
        newMap.set(agentId, {
          agentId,
          messages: [],
          input: '',
          isProcessing: false,
          lastActive: Date.now()
        });
      }
      return newMap;
    });
    setActiveTabAgentId(agentId);
  };

  const closeChatTab = (agentId: string) => {
    setChatSessions(prev => {
      const newMap: Map<string, ChatSession> = new Map(prev);
      newMap.delete(agentId);
      return newMap;
    });
    if (activeTabAgentId === agentId) {
      // 切换到其他标签页或 null
      const remaining = Array.from(chatSessions.keys()).filter(id => id !== agentId);
      setActiveTabAgentId(remaining.length > 0 ? remaining[0] : null);
    }
  };

  const handleInputChange = (value: string) => {
    if (!activeTabAgentId) return;
    setChatSessions(prev => {
      const newMap: Map<string, ChatSession> = new Map(prev);
      const session = newMap.get(activeTabAgentId) as ChatSession | undefined;
      if (session) {
        newMap.set(activeTabAgentId, { ...session, input: value });
      }
      return newMap;
    });
  };

  const handleChatTabClick = (agentId: string) => {
    setActiveTabAgentId(agentId);
    setChatSessions(prev => {
      const newMap: Map<string, ChatSession> = new Map(prev);
      const session = newMap.get(agentId) as ChatSession | undefined;
      if (session) {
        newMap.set(agentId, { ...session, lastActive: Date.now() });
      }
      return newMap;
    });
  };

  const handleNewChatTab = () => {
    // 获取可用的 agent（未打开标签页的）
    const availableAgents = agentsData.filter(a => !chatSessions.has(a.id));
    if (availableAgents.length === 0) {
      alert('No more agents available! All agents already have open tabs.');
      return;
    }
    // 如果只有一个可用 agent，直接打开
    if (availableAgents.length === 1) {
      openChatTab(availableAgents[0].id);
      return;
    }
    // 如果有多个可用 agent，显示选择对话框
    setPendingAgentSelection(availableAgents);
  };

  // 🤖 CLI Chat Mode 处理函数
  const handleChatMessage = async (message: string) => {
    if (!activeTabAgentId) return;

    const currentSession = chatSessions.get(activeTabAgentId);
    if (!currentSession) return;

    // 添加用户消息到当前会话
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };

    setChatSessions(prev => {
      const newMap: Map<string, ChatSession> = new Map(prev);
      const session = newMap.get(activeTabAgentId) as ChatSession | undefined;
      if (session) {
        newMap.set(activeTabAgentId, {
          ...session,
          messages: [...session.messages, userMessage],
          isProcessing: true,
          input: '',
          lastActive: Date.now()
        });
      }
      return newMap;
    });

    try {
      // 设置机器人状态为思考
      triggerState('THINKING', 'Processing your message...', activeTabAgentId);

      // 使用 executeSDKTask 执行（这会使用 agent.run()，支持连续对话）
      const { executeSDKTask } = await import('./agent/gameIntegration');
      const result = await executeSDKTask(
        activeTabAgentId,
        'Chat Message',
        message,
        workingDirectory
      );

      // 添加 AI 回复
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: result,
        timestamp: Date.now(),
      };

      setChatSessions(prev => {
        const newMap: Map<string, ChatSession> = new Map(prev);
        const session = newMap.get(activeTabAgentId) as ChatSession | undefined;
        if (session) {
          newMap.set(activeTabAgentId, {
            ...session,
            messages: [...session.messages, assistantMessage],
            isProcessing: false
          });
        }
        return newMap;
      });

      // 机器人回到空闲状态
      triggerState('IDLE', 'Ready for next message', activeTabAgentId);
    } catch (error: any) {
      // 添加错误消息
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: Date.now(),
      };

      setChatSessions(prev => {
        const newMap: Map<string, ChatSession> = new Map(prev);
        const session = newMap.get(activeTabAgentId) as ChatSession | undefined;
        if (session) {
          newMap.set(activeTabAgentId, {
            ...session,
            messages: [...session.messages, errorMessage],
            isProcessing: false
          });
        }
        return newMap;
      });

      // 机器人进入错误状态
      triggerState('ERROR', `Chat error: ${error.message}`, activeTabAgentId);
    }
  };

  const assignZonePosition = (agent: Agent, state: AgentState) => {
    const getRandomPos = (zone: Zone) => {
      if (zone.rMin !== undefined && zone.rMax !== undefined) {
        // Circular/Annular zone
        const angle = Math.random() * Math.PI * 2;
        const radius = zone.rMin + Math.random() * (zone.rMax - zone.rMin);
        return {
          x: zone.x + Math.cos(angle) * radius,
          y: zone.y + Math.sin(angle) * radius
        };
      }
      
      // Square zone
      return {
        x: zone.x + (Math.random() - 0.5) * (zone.w || 0),
        y: zone.y + (Math.random() - 0.5) * (zone.h || 0)
      };
    };

    let targetZone = ZONES.ROUNDTABLE;
    
    switch (state) {
      case 'IDLE':
      case 'THINKING':
      case 'AWAITING_APPROVAL':
        targetZone = ZONES.ROUNDTABLE;
        break;
      case 'READING':
        targetZone = ZONES.LIBRARY;
        break;
      case 'WRITING':
        targetZone = ZONES.WORKSHOP;
        break;
      case 'EXECUTING':
      case 'ERROR':
        targetZone = ZONES.PROVING_GROUNDS;
        break;
      case 'SUCCESS':
        targetZone = ZONES.REST_AREA;
        break;
    }

    const pos = getRandomPos(targetZone);
    agent.targetX = pos.x;
    agent.targetY = pos.y;
  };

  // --- State Management ---
  const addAgent = async () => {
    const colors = ['#b87333', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#ec4899', '#06b6d4'];

    // 🤖 使用 SDK 创建机器人（如果可用）
    let newAgent;
    try {
      newAgent = await addSDKAgent(
        {
          x: CANVAS_WIDTH / 2 + (Math.random() * 100 - 50),
          y: CANVAS_HEIGHT / 2 + (Math.random() * 100 - 50),
          targetX: CANVAS_WIDTH / 2,
          targetY: CANVAS_HEIGHT / 2,
          state: 'IDLE',
          speed: 90 + Math.random() * 60,
          facing: Math.random() > 0.5 ? 'right' : 'left',
          message: 'Ready for duty!',
        },
        colors
      );
    } catch (error) {
      console.error('SDK agent creation failed, using fallback:', error);
      // Fallback: 创建普通机器人
      newAgent = {
        id: `agent-${Math.random().toString(36).substr(2, 9)}`,
        x: CANVAS_WIDTH / 2 + (Math.random() * 100 - 50),
        y: CANVAS_HEIGHT / 2 + (Math.random() * 100 - 50),
        targetX: CANVAS_WIDTH / 2,
        targetY: CANVAS_HEIGHT / 2,
        state: 'IDLE' as AgentState,
        speed: 90 + Math.random() * 60,
        frame: 0,
        facing: Math.random() > 0.5 ? 'right' : 'left',
        animationVariant: 0,
        color: colors[agentsRef.current.length % colors.length],
        message: 'Ready for duty! (No SDK)',
        overrideTimeout: null
      };
    }

    agentsRef.current.push(newAgent);
    setAgentsData([...agentsRef.current]);
  };

  const triggerState = (newState: AgentState, msg: string, agentId?: string) => {
    const targetAgent = agentId
      ? agentsRef.current.find(a => a.id === agentId)
      : agentsRef.current[Math.floor(Math.random() * agentsRef.current.length)];

    if (!targetAgent) return;

    // 🤖 首先通过 SDK 触发状态变化
    triggerSDKState(newState, msg, targetAgent.id);

    // 然后更新游戏中的状态
    if (targetAgent.overrideTimeout) {
      clearTimeout(targetAgent.overrideTimeout);
      targetAgent.overrideTimeout = null;
    }

    targetAgent.state = newState;
    targetAgent.message = msg;
    targetAgent.overrideMode = undefined;

    // SUCCESS has 4 variants now, others have 3
    const maxVariants = newState === 'SUCCESS' ? 4 : 3;
    targetAgent.animationVariant = Math.floor(Math.random() * maxVariants);

    assignZonePosition(targetAgent, newState);

    if (newState === 'AWAITING_APPROVAL') {
      setApprovalAgentId(targetAgent.id);
    }

    setAgentsData([...agentsRef.current]);
  };

  // --- Game Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const drawEnvironment = (ctx: CanvasRenderingContext2D, time: number) => {
      // Draw Background Image
      if (bgImageRef.current) {
        ctx.drawImage(bgImageRef.current, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else {
        // Fallback loading state
        ctx.fillStyle = '#2d1b15';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = '#e5e7eb';
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Loading Background...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      }
    };

    const drawAgent = (ctx: CanvasRenderingContext2D, agent: Agent, time: number) => {
      ctx.save();
      ctx.translate(agent.x, agent.y);
      
      const dx = agent.targetX - agent.x;
      const dy = agent.targetY - agent.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isMoving = dist > 2; // Threshold for movement
      const isDragging = agent.overrideMode === 'dragging';
      const bob = isMoving && !isDragging ? Math.sin(time / 50) * 4 : 0;
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      if (isDragging) {
        ctx.ellipse(0, 35, 12, 4, 0, 0, Math.PI*2);
      } else {
        ctx.ellipse(0, 20, 15, 5, 0, 0, Math.PI*2);
      }
      ctx.fill();

      // Selection Indicator
      if (agent.id === selectedAgentIdRef.current) {
        ctx.save();
        ctx.strokeStyle = '#facc15'; // Yellow
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -time / 50;
        ctx.beginPath();
        if (isDragging) {
          ctx.ellipse(0, 35, 20, 8, 0, 0, Math.PI * 2);
        } else {
          ctx.ellipse(0, 20, 20, 8, 0, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.restore();
      }

      ctx.translate(0, bob);
      if (isDragging) {
        ctx.translate(0, -15);
        ctx.rotate(Math.sin(time / 50) * 0.2);
      }
      
      // Flip if facing left
      if (agent.facing === 'left') {
        ctx.scale(-1, 1);
      }

      // Determine eye color based on state
      let eyeColor = '#10b981'; // Default green
      if (isDragging) eyeColor = '#ef4444'; // Scared/struggling eyes
      else if (agent.state === 'ERROR') eyeColor = '#ef4444'; // Red
      else if (agent.state === 'THINKING' || agent.state === 'PLANNING') eyeColor = '#f59e0b'; // Yellow
      else if (agent.state === 'SUCCESS') eyeColor = '#ec4899'; // Pink
      else if (agent.state === 'READING' || agent.state === 'WRITING') eyeColor = '#3b82f6'; // Blue

      // Pixel Art Robot Sprites (12x14 grid)
      const sprites = {
        idle: [
          "     OO     ",
          "     MM     ",
          "   OOOOOO   ",
          "  OMMMMMMO  ",
          "  OMGGGGMO  ",
          "  OGGEEGGO  ",
          "  OMGGGGMO  ",
          " OOSSSSSSOO ",
          " OMMMMMMMMO ",
          " OOSSSSSSOO ",
          "   OMMMMO   ",
          "   OSSSSO   ",
          "   OO  OO   ",
          "   OO  OO   "
        ],
        walk1: [
          "     OO     ",
          "     MM     ",
          "   OOOOOO   ",
          "  OMMMMMMO  ",
          "  OMGGGGMO  ",
          "  OGGEEGGO  ",
          "  OMGGGGMO  ",
          " OOSSSSSSOO ",
          " OMMMMMMMMO ",
          " OOSSSSSSOO ",
          "   OMMMMO   ",
          "   OSSSSO   ",
          "    OOOO    ",
          "    OOOO    "
        ],
        walk2: [
          "     OO     ",
          "     MM     ",
          "   OOOOOO   ",
          "  OMMMMMMO  ",
          "  OMGGGGMO  ",
          "  OGGEEGGO  ",
          "  OMGGGGMO  ",
          " OOSSSSSSOO ",
          " OMMMMMMMMO ",
          " OOSSSSSSOO ",
          "   OMMMMO   ",
          "   OSSSSO   ",
          "  OO    OO  ",
          "  OO    OO  "
        ]
      };

      // Select frame
      let currentSprite = sprites.idle;
      if (isDragging) {
        const struggleCycle = Math.floor(time / 50) % 2;
        currentSprite = struggleCycle === 0 ? sprites.walk1 : sprites.walk2;
      } else if (isMoving) {
        const walkCycle = Math.floor(time / 150) % 4;
        if (walkCycle === 0) currentSprite = sprites.walk1;
        else if (walkCycle === 1) currentSprite = sprites.idle;
        else if (walkCycle === 2) currentSprite = sprites.walk2;
        else currentSprite = sprites.idle;
      }

      // Draw Pixel Sprite
      const pixelSize = 3;
      const width = currentSprite[0].length * pixelSize;
      const height = currentSprite.length * pixelSize;
      
      ctx.translate(-width / 2, -height / 2); // Center sprite

      for (let r = 0; r < currentSprite.length; r++) {
        for (let c = 0; c < currentSprite[r].length; c++) {
          const char = currentSprite[r][c];
          if (char === ' ') continue;
          
          if (char === 'O') ctx.fillStyle = '#2d1b15'; // Dark outline
          else if (char === 'M') ctx.fillStyle = agent.color; // Dynamic body color
          else if (char === 'G') ctx.fillStyle = '#111827'; // Screen background
          else if (char === 'E') ctx.fillStyle = eyeColor; // Dynamic eyes
          else if (char === 'S') ctx.fillStyle = '#8b4513'; // Shadow/Joints
          
          ctx.fillRect(c * pixelSize, r * pixelSize, pixelSize, pixelSize);
        }
      }

      // Reset translation for props
      ctx.translate(width / 2, height / 2);

      if (isDragging) {
        // Sweat drops
        ctx.fillStyle = '#60a5fa';
        ctx.fillRect(-20, -10 + Math.sin(time/50)*3, 3, 6);
        ctx.fillRect(20, -5 + Math.cos(time/50)*3, 3, 6);
      } else {
        // State-specific animations/props (drawn in pixel style)
        if (agent.state === 'WRITING' && !isMoving) {
        if (agent.animationVariant === 0) {
          // Variant 0: Hammering (Workshop)
          ctx.fillStyle = '#71717a';
          const hammerAngle = Math.sin(time / 100) * Math.PI / 4;
          ctx.rotate(hammerAngle);
          ctx.fillRect(15, -10, 4, 15); // Handle
          ctx.fillRect(10, -15, 14, 8); // Hammer head
          if (Math.random() > 0.7) {
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(20 + Math.random() * 10, -10 + Math.random() * 10, 3, 3);
          }
        } else if (agent.animationVariant === 1) {
          // Variant 1: Soldering/Welding
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(12, 0, 10, 4);
          if (Math.floor(time / 50) % 2 === 0) {
            ctx.fillStyle = '#60a5fa';
            for(let i=0; i<5; i++) {
              ctx.fillRect(15 + Math.random()*15, -5 + Math.random()*10, 2, 2);
            }
          }
        } else {
          // Variant 2: Screwdriver
          ctx.fillStyle = '#a1a1aa';
          ctx.rotate(time / 50);
          ctx.fillRect(12, -2, 12, 4);
          ctx.fillStyle = '#4b5563';
          ctx.fillRect(20, -3, 6, 6);
        }
      } else if (agent.state === 'READING' && !isMoving) {
        if (agent.animationVariant === 0) {
          // Variant 0: Holding a book (Library) - Brown book
          ctx.fillStyle = '#8b4513';
          ctx.fillRect(10, 0, 12, 16);
          ctx.fillStyle = '#f5f5f5'; // White pages
          ctx.fillRect(12, 2, 8, 2);
          ctx.fillRect(12, 6, 8, 2);
        } else if (agent.animationVariant === 1) {
          // Variant 1: Data Scan Laser
          ctx.fillStyle = 'rgba(59, 130, 246, 0.5)';
          const scanY = Math.sin(time / 200) * 20;
          ctx.fillRect(-20, scanY, 40, 2);
          ctx.fillStyle = '#60a5fa';
          ctx.fillRect(-20, scanY, 40, 0.5);
        } else {
          // Variant 2: Floating scrolls
          ctx.fillStyle = '#f5f5f5';
          const orbitX = Math.cos(time / 300) * 25;
          const orbitY = Math.sin(time / 300) * 15;
          ctx.fillRect(orbitX, orbitY - 20, 8, 12);
          ctx.fillStyle = '#d4d4d4';
          ctx.fillRect(orbitX + 1, orbitY - 18, 6, 1);
        }
      } else if (agent.state === 'THINKING' && !isMoving) {
        if (agent.animationVariant === 0) {
          // Variant 0: Thinking bubble (Roundtable)
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(10, -25, 4, 4);
          ctx.fillRect(15, -35, 6, 6);
          ctx.fillRect(20, -50, 20, 15);
          ctx.fillStyle = '#111827';
          ctx.fillRect(24, -46, 4, 4);
          ctx.fillRect(32, -46, 4, 4);
        } else if (agent.animationVariant === 1) {
          // Variant 1: Holographic Globe - Thicker and more pixelated
          ctx.fillStyle = '#60a5fa';
          const globePixels = [
            [0,0,1,1,1,0,0],
            [0,1,1,1,1,1,0],
            [1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1],
            [1,1,1,1,1,1,1],
            [0,1,1,1,1,1,0],
            [0,0,1,1,1,0,0],
          ];
          const pSize = 4;
          const rotateX = Math.sin(time / 500) * 10;
          ctx.translate(-14 + rotateX, -50);
          for(let r=0; r<globePixels.length; r++) {
            for(let c=0; c<globePixels[r].length; c++) {
              if(globePixels[r][c]) ctx.fillRect(c*pSize, r*pSize, pSize, pSize);
            }
          }
          // Orbit ring
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillRect(-5, 12, 35, 2);
        } else {
          // Variant 2: Pixel Lightbulb (To the side to avoid bubble)
          ctx.translate(25, -30);
          ctx.fillStyle = '#facc15'; // Bulb
          ctx.fillRect(0, 0, 12, 12);
          ctx.fillRect(2, 12, 8, 4);
          ctx.fillStyle = '#71717a'; // Base
          ctx.fillRect(2, 16, 8, 4);
          // Glow lines
          if (Math.floor(time / 200) % 2 === 0) {
            ctx.fillStyle = '#fef08a';
            ctx.fillRect(6, -6, 2, 4);
            ctx.fillRect(14, 4, 4, 2);
            ctx.fillRect(-6, 4, 4, 2);
          }
        }
      } else if (agent.state === 'EXECUTING' && !isMoving) {
        if (agent.animationVariant === 0) {
          // Variant 0: Lightning (Proving Grounds)
          ctx.fillStyle = '#10b981';
          const flash = Math.floor(time / 100) % 2 === 0;
          if (flash) {
            ctx.fillRect(15, -20, 4, 10);
            ctx.fillRect(11, -10, 8, 4);
            ctx.fillRect(15, -6, 4, 10);
          }
        } else if (agent.animationVariant === 1) {
          // Variant 1: Binary Stream
          ctx.fillStyle = '#10b981';
          ctx.font = '8px monospace';
          for(let i=0; i<3; i++) {
            const y = -20 - ((time/20 + i*10) % 40);
            ctx.fillText(Math.random() > 0.5 ? "1" : "0", 15, y);
          }
        } else {
          // Variant 2: Shield/Firewall - Thicker
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 4;
          ctx.setLineDash([8, 4]);
          ctx.beginPath();
          ctx.arc(0, 0, 35 + Math.sin(time/200)*3, 0, Math.PI*2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineWidth = 1;
        }
      } else if (agent.state === 'ERROR' && !isMoving) {
        if (agent.animationVariant === 0) {
          // Variant 0: Smoke/Fire (Proving Grounds)
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(10, -15, 8, 8);
          ctx.fillStyle = '#f97316';
          ctx.fillRect(12, -20, 6, 6);
          ctx.fillStyle = '#52525b';
          const smokeY = (time / 50) % 20;
          ctx.fillRect(14, -25 - smokeY, 4, 4);
        } else if (agent.animationVariant === 1) {
          // Variant 1: Glitch
          const offset = Math.sin(time/20) * 5;
          ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
          ctx.fillRect(offset, -10, 20, 20);
        } else {
          // Variant 2: Warning Icons
          ctx.fillStyle = '#ef4444';
          const float = Math.sin(time/150) * 5;
          ctx.fillRect(20, -30 + float, 4, 10);
          ctx.fillRect(20, -18 + float, 4, 4);
        }
      } else if (agent.state === 'AWAITING_APPROVAL') {
        // Exclamation mark above head (Roundtable)
        ctx.fillStyle = '#eab308';
        ctx.fillRect(-2, -35, 4, 12);
        ctx.fillRect(-2, -20, 4, 4);
      } else if (agent.state === 'SUCCESS' && !isMoving) {
        if (agent.animationVariant === 0) {
          // Variant 0: Heart (Rest Area)
          ctx.fillStyle = '#ec4899';
          const bounce = Math.sin(time/200)*5;
          ctx.fillRect(12, -20 + bounce, 4, 4);
          ctx.fillRect(20, -20 + bounce, 4, 4);
          ctx.fillRect(10, -16 + bounce, 16, 4);
          ctx.fillRect(12, -12 + bounce, 12, 4);
          ctx.fillRect(16, -8 + bounce, 4, 4);
        } else if (agent.animationVariant === 1) {
          // Variant 1: Coffee/Oil Mug
          ctx.fillStyle = '#78350f';
          ctx.fillRect(12, -5, 10, 12);
          ctx.fillStyle = '#d4d4d4';
          ctx.fillRect(20, -2, 4, 6);
          // Steam
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fillRect(14, -12 - (time/50 % 10), 2, 4);
        } else if (agent.animationVariant === 2) {
          // Variant 2: Victory Spin + Jump
          const jump = Math.abs(Math.sin(time / 150)) * 15;
          ctx.translate(0, -jump);
          ctx.rotate(time / 100);
          ctx.fillStyle = '#facc15';
          for(let i=0; i<4; i++) {
            const angle = (i * Math.PI / 2) + time/200;
            ctx.fillRect(Math.cos(angle)*20, Math.sin(angle)*20, 3, 3);
          }
        } else {
          // Variant 3: Sleeping (ZZZ)
          ctx.fillStyle = '#3b82f6';
          const zTime = (time / 1000) % 3;
          for(let i=0; i<3; i++) {
            const offset = (zTime + i) % 3;
            const size = 4 + offset * 4;
            const x = 15 + offset * 15;
            const y = -20 - offset * 20;
            ctx.font = `${size}px "Press Start 2P"`;
            ctx.fillText("Z", x, y);
          }
          // Closed eyes (override)
          ctx.fillStyle = '#2d1b15';
          ctx.fillRect(-6, -12, 4, 2);
          ctx.fillRect(2, -12, 4, 2);
        }
      }
      } // End of !isDragging block

      ctx.restore();
    };

    const update = (dt: number) => {
      let emergencyActive = emergencyEndTimeRef.current > 0;
      let allArrivedEmergency = true;

      agentsRef.current.forEach(agent => {
        // Move towards target
        const dx = agent.targetX - agent.x;
        const dy = agent.targetY - agent.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 2) {
          const moveStep = agent.speed * dt;
          if (moveStep >= dist) {
            agent.x = agent.targetX;
            agent.y = agent.targetY;
          } else {
            agent.x += (dx / dist) * moveStep;
            agent.y += (dy / dist) * moveStep;
          }
          agent.facing = dx > 0 ? 'right' : 'left';
        } else {
          // Arrived at target
          if (agent.overrideMode === 'moving') {
            agent.overrideMode = 'waiting';
            agent.overrideTimeout = window.setTimeout(() => {
              assignZonePosition(agent, agent.state);
              agent.overrideMode = undefined;
              agent.overrideTimeout = null;
            }, 2000);
          } else if (agent.overrideMode === 'moving_to_emergency') {
            agent.overrideMode = 'waiting';
          }
        }

        if (agent.overrideMode === 'moving_to_emergency') {
          allArrivedEmergency = false;
        }
      });

      if (emergencyActive && allArrivedEmergency) {
        emergencyEndTimeRef.current = 0; // Stop flashing
        setCurrentView('ROUNDTABLE_CHAT');
      }
    };

    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      update(dt);
      
      // Update bubble positions
      agentsRef.current.forEach(agent => {
        const bubble = document.getElementById(`bubble-${agent.id}`);
        if (bubble) {
          bubble.style.left = `${agent.x}px`;
          bubble.style.top = `${agent.y - 60}px`;
        }
      });
      
      // Render
      drawEnvironment(ctx, time);

      // Draw Emergency Button
      const btn = INTERACTABLES.EMERGENCY_BUTTON;
      const mx = mousePosRef.current.x;
      const my = mousePosRef.current.y;
      const isHoveringBtn = Math.sqrt(Math.pow(mx - btn.x, 2) + Math.pow(my - btn.y, 2)) <= btn.radius;
      const isEmergency = time < emergencyEndTimeRef.current;

      ctx.save();
      ctx.translate(btn.x, btn.y);
      
      // Base (pedestal)
      const drawBaseShape = (yOffset: number, color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(-16, -4 + yOffset, 32, 4);
        ctx.fillRect(-24, 0 + yOffset, 48, 4);
        ctx.fillRect(-28, 4 + yOffset, 56, 8);
        ctx.fillRect(-24, 12 + yOffset, 48, 4);
        ctx.fillRect(-16, 16 + yOffset, 32, 4);
      };

      // Base Side
      for (let offset = 4; offset <= 12; offset += 4) {
        drawBaseShape(offset, '#1f2937');
      }
      // Base Top
      drawBaseShape(0, '#4b5563');

      // Button
      const pressOffset = isEmergency ? 4 : 0;
      const by = -12 + pressOffset;

      const drawButtonShape = (yOffset: number, color: string) => {
        ctx.fillStyle = color;
        ctx.fillRect(-12, -4 + yOffset, 24, 4);
        ctx.fillRect(-16, 0 + yOffset, 32, 4);
        ctx.fillRect(-20, 4 + yOffset, 40, 8);
        ctx.fillRect(-16, 12 + yOffset, 32, 4);
        ctx.fillRect(-12, 16 + yOffset, 24, 4);
      };

      // Button Side
      for (let offset = 4; offset <= 8; offset += 4) {
        drawButtonShape(by + offset, '#7f1d1d');
      }
      
      // Button Top
      let topColor = isHoveringBtn ? '#f87171' : '#ef4444';
      if (isEmergency) {
        topColor = Math.floor(time / 150) % 2 === 0 ? '#fca5a5' : '#ef4444';
      }
      drawButtonShape(by, topColor);
      
      // Pixel Highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(-12, by, 8, 4);
      ctx.fillRect(-16, by + 4, 4, 4);
      
      ctx.restore();

      agentsRef.current.forEach(agent => {
        drawAgent(ctx, agent, time);
      });

      // Draw Emergency Overlay
      if (isEmergency) {
        ctx.fillStyle = `rgba(239, 68, 68, ${Math.abs(Math.sin(time / 150)) * 0.25})`;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        ctx.save();
        ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 100);
        const scale = 1 + Math.abs(Math.sin(time / 150)) * 0.1;
        ctx.scale(scale, scale);
        
        ctx.font = 'bold 40px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#000';
        ctx.strokeText("BRAINSTORMING MODE", 0, 0);
        
        ctx.fillStyle = '#ef4444';
        ctx.fillText("BRAINSTORMING MODE", 0, 0);
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="h-screen w-screen bg-zinc-950 flex flex-col font-sans text-zinc-100 overflow-hidden select-none">
      {/* Custom Windows Title Bar */}
      <div className="h-8 bg-zinc-900 flex items-center justify-between border-b border-zinc-800 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex items-center gap-2 px-3">
          <Terminal size={14} className="text-emerald-500" />
          <span className="text-xs font-medium text-zinc-300 tracking-wide">AI Agent Workspace - Pixel Farm Edition</span>
        </div>
        <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button className="h-full px-4 hover:bg-zinc-800 text-zinc-400 transition-colors flex items-center justify-center">
            <Minus size={14} />
          </button>
          <button className="h-full px-4 hover:bg-zinc-800 text-zinc-400 transition-colors flex items-center justify-center">
            <Square size={12} />
          </button>
          <button className="h-full px-4 hover:bg-red-500 hover:text-white text-zinc-400 transition-colors flex items-center justify-center">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Game Area */}
        <div className="flex-1 relative bg-zinc-950 overflow-auto p-8 custom-scrollbar">
          
          {/* Game Canvas Container */}
          <div className="relative shadow-2xl border-4 border-zinc-800 rounded-lg overflow-hidden bg-black mx-auto" style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, minWidth: CANVAS_WIDTH, minHeight: CANVAS_HEIGHT }}>
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className={`block ${isHoveringInteractable ? 'cursor-pointer' : 'cursor-crosshair'}`}
              style={{ imageRendering: 'pixelated' }}
            />
            
            {/* Bulletin Board Overlay */}
            {currentView === 'BULLETIN' && (
              <BulletinBoard
                tasks={tasks}
                onAddTask={addTask}
                onClose={() => setCurrentView('MAIN')}
                newTaskTitle={newTaskTitle}
                setNewTaskTitle={setNewTaskTitle}
                expandedTaskId={expandedTaskId}
                onToggleExpand={(id: string) => setExpandedTaskId(expandedTaskId === id ? null : id)}
                onUpdateSupplementaryInput={updateTaskSupplementaryInput}
                agentsData={agentsData}
                onAssignTask={assignTaskToAgent}
                onExecuteTask={executeTask}
              />
            )}

            {currentView === 'ROUNDTABLE_CHAT' && (
              <RoundtableChat onClose={() => {
                setCurrentView('MAIN');
                triggerState('IDLE', 'Brainstorming session ended.');
              }} />
            )}

            {currentView === 'CLI_CHAT' && (
              <CliChatMode
                onClose={() => {
                  setCurrentView('MAIN');
                  triggerState('IDLE', 'CLI Chat session ended.');
                }}
                activeSession={chatSessions.get(activeTabAgentId ?? '') ?? null}
                onSendMessage={handleChatMessage}
                onInputChange={handleInputChange}
                agentsData={agentsData}
                onTabClick={handleChatTabClick}
                onCloseTab={closeChatTab}
                onNewTab={handleNewChatTab}
                allSessions={Array.from(chatSessions.values())}
              />
            )}

            {/* Agent Selection Dialog for New Chat Tab */}
            {pendingAgentSelection && (
              <div
                className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
              >
                <div
                  className="relative w-full max-w-[400px] bg-zinc-900 shadow-2xl border-4 border-[#3d251e] rounded-lg"
                  style={{ imageRendering: 'pixelated', fontFamily: '"Press Start 2P", cursive' }}
                >
                  {/* Header */}
                  <div className="bg-[#3d251e] p-3 flex justify-between items-center border-b-4 border-black">
                    <h2 className="text-sm font-bold text-[#fef08a] tracking-wider">🤖 SELECT AGENT</h2>
                    <button
                      onClick={() => setPendingAgentSelection(null)}
                      className="text-[#fef08a] hover:text-red-400 font-bold text-sm"
                    >
                      [X]
                    </button>
                  </div>

                  {/* Agent List */}
                  <div className="p-4 flex flex-col gap-2">
                    <p className="text-[10px] text-zinc-400 mb-3">Choose an agent to open a new chat tab:</p>
                    {pendingAgentSelection.map((agent) => (
                      <button
                        key={agent.id}
                        onClick={() => {
                          openChatTab(agent.id);
                          setPendingAgentSelection(null);
                        }}
                        className="bg-[#2d1b15] border-2 border-[#5d4037] p-3 text-left hover:bg-[#3e2723] hover:border-[#fef08a] transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-[#fef08a] font-bold">{agent.id}</span>
                          <span className={`text-[8px] px-2 py-1 rounded ${
                            agent.state === 'IDLE' ? 'bg-emerald-900 text-emerald-400' :
                            agent.state === 'THINKING' ? 'bg-yellow-900 text-yellow-400' :
                            agent.state === 'ERROR' ? 'bg-red-900 text-red-400' :
                            'bg-zinc-700 text-zinc-400'
                          }`}>
                            {agent.state}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* HTML Overlay for Agent Message Boxes */}
            {agentsData.map(agent => (
              <div 
                key={agent.id}
                id={`bubble-${agent.id}`}
                className="absolute flex flex-col items-center z-40"
                style={{ 
                  left: agent.x, 
                  top: agent.y - 60,
                  transform: 'translate(-50%, -100%)',
                  opacity: agent.state === 'IDLE' ? 0 : 1,
                  pointerEvents: agent.state === 'IDLE' ? 'none' : 'auto'
                }}
              >
                <div 
                  onClick={() => setDetailedMessageAgentId(agent.id)}
                  className="bg-[#f4e4bc] text-[#4e342e] px-3 py-2 border-4 border-[#8b5a2b] shadow-xl max-w-[180px] text-[8px] leading-relaxed relative cursor-pointer hover:bg-[#e6d5a7] transition-colors"
                  style={{ fontFamily: '"Press Start 2P", cursive', imageRendering: 'pixelated' }}
                >
                  <div className="line-clamp-3">{agent.message}</div>
                  {/* Speech bubble tail */}
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#f4e4bc] border-b-4 border-r-4 border-[#8b5a2b] transform rotate-45"></div>
                </div>
              </div>
            ))}

            {/* Detailed Message Modal */}
            {detailedMessageAgentId && (() => {
              const agent = agentsData.find(a => a.id === detailedMessageAgentId);
              if (!agent) return null;
              return (
              <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-8"
                onClick={() => setDetailedMessageAgentId(null)}
              >
                <div 
                  className="bg-[#f4e4bc] border-8 border-[#8b5a2b] p-8 max-w-2xl w-full shadow-2xl relative animate-in zoom-in duration-200"
                  style={{ fontFamily: '"Press Start 2P", cursive' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button 
                    onClick={() => setDetailedMessageAgentId(null)}
                    className="absolute -top-6 -right-6 bg-red-900 text-white p-2 border-4 border-red-950 hover:bg-red-700 transition-colors cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                  
                  <div className="flex items-center gap-4 mb-6 border-b-4 border-[#8b5a2b] pb-4">
                    <div className="w-12 h-12 border-4 border-[#2d1b15] flex items-center justify-center" style={{ backgroundColor: agent.color }}>
                      <Terminal size={24} className="text-[#111827]" />
                    </div>
                    <div>
                      <h3 className="text-[#5d4037] text-xs uppercase tracking-tighter">Agent Transmission</h3>
                      <p className="text-[8px] text-[#8b5a2b] mt-1">Status: {agent.state}</p>
                    </div>
                  </div>

                  <div className="bg-black/10 p-4 border-4 border-[#8b5a2b]/30 text-[#4e342e] text-[10px] leading-loose whitespace-pre-wrap">
                    {agent.message}
                  </div>

                  {/* User Input in Modal */}
                  <div className="mt-6">
                    <label className="text-[8px] text-[#8b5a2b] mb-2 block uppercase tracking-tighter">Your Command:</label>
                    <input 
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={handleUserSubmit}
                      placeholder="TYPE COMMAND HERE AND PRESS ENTER..."
                      className="w-full bg-black/5 border-4 border-[#8b5a2b] px-4 py-3 text-[#4e342e] text-[10px] focus:outline-none placeholder:text-[#8b5a2b]/30"
                      style={{ fontFamily: '"Press Start 2P", cursive' }}
                      autoFocus
                    />
                  </div>

                  <div className="mt-6 flex justify-end gap-4">
                    <button 
                      onClick={() => setDetailedMessageAgentId(null)}
                      className="bg-[#d7ccc8] hover:bg-[#bcaaa4] text-[#4e342e] px-6 py-2 border-4 border-[#8b5a2b] text-[10px] font-bold cursor-pointer transition-colors"
                    >
                      CANCEL
                    </button>
                    <button 
                      onClick={() => handleUserSubmit({ key: 'Enter' } as any)}
                      className="bg-[#8b5a2b] hover:bg-[#5d4037] text-[#f4e4bc] px-6 py-2 border-4 border-[#2d1b15] text-[10px] font-bold cursor-pointer transition-colors"
                    >
                      SEND
                    </button>
                  </div>
                </div>
              </div>
              );
            })()}

            {/* Approval Dialog Overlay - 复用用于权限审批和用户提问 */}
            {approvalAgentId && (() => {
              const agent = agentsData.find(a => a.id === approvalAgentId);
              if (!agent) return null;

              return (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-[#f4e4bc] border-4 border-[#8b5a2b] p-6 rounded-lg shadow-2xl max-w-md w-full transform animate-in zoom-in duration-200">
                  <h3 className="text-[#5d4037] font-bold text-lg mb-2 flex items-center gap-2">
                    <AlertTriangle className="text-yellow-600" />
                    {currentQuestion ? 'Agent Question' : 'Permission Required'}
                  </h3>

                  {/* 动态内容：用户提问或默认权限消息 */}
                  {currentQuestion ? (
                    <>
                      <p className="text-[#4e342e] mb-4 font-medium text-sm whitespace-pre-wrap">
                        {currentQuestion.question}
                      </p>

                      {/* 如果有选项，显示按钮选项 */}
                      {currentQuestion.options ? (
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          {currentQuestion.options.map((option, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                console.log('[App] Option button clicked:', { option, questionId: currentQuestion.id });

                                // 1. 调用 AgentBridge 的 answerQuestion 方法来 resolve SDK 的 Promise
                                const bridgeAnswered = answerUserQuestion(currentQuestion.id, option);
                                console.log('[App] AgentBridge answerQuestion result:', bridgeAnswered);

                                // 2. 同时 resolve App.tsx 的 Promise
                                const resolver = (window as any).__questionResolvers?.[currentQuestion.id];
                                console.log('[App] App resolver found:', !!resolver);
                                if (resolver) {
                                  console.log('[App] Calling App resolver with:', option);
                                  resolver(option);
                                  delete (window as any).__questionResolvers[currentQuestion.id];
                                  console.log('[App] App resolver called and deleted');
                                } else {
                                  console.error('[App] No App resolver found for question:', currentQuestion.id);
                                }
                                setPendingQuestions(prev => prev.filter(q => q.id !== currentQuestion.id));
                                setCurrentQuestion(null);
                                setApprovalAgentId(null);
                                triggerState('THINKING', 'Processing answer...', agent.id);
                              }}
                              className="px-4 py-3 bg-[#8b5a2b] hover:bg-[#5d4037] text-[#f4e4bc] text-xs font-bold rounded border-2 border-[#2d1b15] transition-colors"
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      ) : (
                        /* 没有选项时显示文本输入框 */
                        <div className="mb-4">
                          <input
                            type="text"
                            placeholder="Type your answer..."
                            className="w-full bg-white/50 border-2 border-[#8b5a2b] px-4 py-3 text-[#4e342e] text-sm focus:outline-none focus:border-[#fef08a] rounded"
                            autoFocus
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                const input = e.currentTarget;
                                const value = input.value.trim();
                                console.log('[App] Text input submit:', value);

                                // 调用 AgentBridge 的 answerQuestion
                                answerUserQuestion(currentQuestion.id, value || '(empty)');

                                // 同时 resolve App.tsx 的 Promise
                                const resolver = (window as any).__questionResolvers?.[currentQuestion.id];
                                if (resolver) {
                                  resolver(value || '(empty)');
                                  delete (window as any).__questionResolvers[currentQuestion.id];
                                } else {
                                  console.error('[App] No resolver for question:', currentQuestion.id);
                                }
                                setPendingQuestions(prev => prev.filter(q => q.id !== currentQuestion.id));
                                setCurrentQuestion(null);
                                setApprovalAgentId(null);
                                triggerState('THINKING', 'Processing answer...', agent.id);
                              }
                            }}
                          />
                        </div>
                      )}

                      {/* 取消按钮 */}
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => {
                            // 调用 AgentBridge 的 answerQuestion
                            answerUserQuestion(currentQuestion.id, 'CANCELLED');

                            // 同时 resolve App.tsx 的 Promise
                            const resolver = (window as any).__questionResolvers?.[currentQuestion.id];
                            if (resolver) {
                              resolver('CANCELLED');
                              delete (window as any).__questionResolvers[currentQuestion.id];
                            }
                            setPendingQuestions(prev => prev.filter(q => q.id !== currentQuestion.id));
                            setCurrentQuestion(null);
                            setApprovalAgentId(null);
                            triggerState('IDLE', 'Question cancelled.', agent.id);
                          }}
                          className="px-4 py-2 bg-[#d7ccc8] hover:bg-[#bcaaa4] text-[#4e342e] font-bold rounded border-2 border-[#8d6e63] transition-colors"
                        >
                          Cancel
                        </button>
                        {!currentQuestion.options && (
                          <button
                            onClick={() => {
                              const input = document.querySelector('input[placeholder="Type your answer..."]') as HTMLInputElement;
                              const value = input?.value?.trim() || '(no input)';
                              console.log('[App] Submit button clicked, value:', value);

                              // 调用 AgentBridge 的 answerQuestion
                              answerUserQuestion(currentQuestion.id, value);

                              // 同时 resolve App.tsx 的 Promise
                              const resolver = (window as any).__questionResolvers?.[currentQuestion.id];
                              if (resolver) {
                                resolver(value);
                                delete (window as any).__questionResolvers[currentQuestion.id];
                              } else {
                                console.error('[App] No resolver for question:', currentQuestion.id);
                              }
                              setPendingQuestions(prev => prev.filter(q => q.id !== currentQuestion.id));
                              setCurrentQuestion(null);
                              setApprovalAgentId(null);
                              triggerState('THINKING', 'Processing answer...', agent.id);
                            }}
                            className="px-4 py-2 bg-[#4caf50] hover:bg-[#43a047] text-white font-bold rounded border-2 border-[#2e7d32] transition-colors"
                          >
                            Submit
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    /* 默认权限审批消息 - 原始 demo 功能，现已兼容新逻辑 */
                    <>
                      <p className="text-[#4e342e] mb-4 font-medium text-sm">
                        Agent requires permission to proceed with an operation.
                      </p>
                      <p className="text-[#8b5a2b] mb-6 text-xs italic">
                        (Demo: Originally shown for git commit - now integrated with ask_user_question tool)
                      </p>
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => {
                            // 如果有 pending questions，解析第一个为 CANCELLED
                            const firstPending = pendingQuestions[0];
                            if (firstPending) {
                              const resolver = (window as any).__questionResolvers?.[firstPending.id];
                              if (resolver) {
                                resolver('CANCELLED');
                                delete (window as any).__questionResolvers[firstPending.id];
                              }
                              setPendingQuestions(prev => prev.filter(q => q.id !== firstPending.id));
                            }
                            setCurrentQuestion(null);
                            setApprovalAgentId(null);
                            triggerState('IDLE', "Task cancelled.", agent.id);
                          }}
                          className="px-4 py-2 bg-[#d7ccc8] hover:bg-[#bcaaa4] text-[#4e342e] font-bold rounded border-2 border-[#8d6e63] transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => {
                            // 如果有 pending questions，解析第一个为 APPROVED
                            const firstPending = pendingQuestions[0];
                            if (firstPending) {
                              const resolver = (window as any).__questionResolvers?.[firstPending.id];
                              if (resolver) {
                                // 如果有选项，使用第一个选项；否则返回 APPROVED
                                const answer = firstPending.options?.[0] || 'APPROVED';
                                console.log('[App] Default Approve: resolving with', answer);
                                resolver(answer);
                                delete (window as any).__questionResolvers[firstPending.id];
                              }
                              setPendingQuestions(prev => prev.filter(q => q.id !== firstPending.id));
                            }
                            setCurrentQuestion(null);
                            setApprovalAgentId(null);
                            triggerState('EXECUTING', "Proceeding with operation...", agent.id);
                          }}
                          className="px-4 py-2 bg-[#4caf50] hover:bg-[#43a047] text-white font-bold rounded border-2 border-[#2e7d32] transition-colors"
                        >
                          Approve
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              );
            })()}

            {/* Bottom UI Icons */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 z-40">
              <button
                onClick={() => setShowDirConfig(true)}
                className="bg-[#2d1b15] border-4 border-[#5d4037] p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] hover:bg-[#3e2723] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] active:translate-y-[4px] active:shadow-none transition-all group"
                title="Configure Working Directory"
              >
                <Folder className="text-[#a1887f] group-hover:text-[#d7ccc8] transition-colors" size={28} />
              </button>
              <button
                onClick={() => {
                  setCurrentView('CLI_CHAT');
                  // 如果没有打开的标签页，自动打开第一个 agent 的标签页
                  if (agentsRef.current.length > 0 && chatSessions.size === 0) {
                    openChatTab(agentsRef.current[0].id);
                  }
                }}
                className="bg-[#2d1b15] border-4 border-[#5d4037] p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] hover:bg-[#3e2723] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] active:translate-y-[4px] active:shadow-none transition-all group"
                title="CLI Chat Mode - Continuous Conversation"
              >
                <Terminal className="text-[#a1887f] group-hover:text-[#d7ccc8] transition-colors" size={24} />
              </button>
              <button 
                onClick={addAgent}
                className="bg-[#2d1b15] border-4 border-[#5d4037] p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] hover:bg-[#3e2723] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] active:translate-y-[4px] active:shadow-none transition-all group"
                title="Add New Agent"
              >
                <Bot className="text-[#a1887f] group-hover:text-[#d7ccc8] transition-colors" size={24} />
              </button>
              <button 
                ref={trashRef}
                className="bg-[#2d1b15] border-4 border-[#5d4037] p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.5)] hover:bg-[#3e2723] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] active:translate-y-[4px] active:shadow-none transition-all group"
                title="Drag Agent Here to Delete"
              >
                <Trash2 className="text-[#a1887f] group-hover:text-red-400 transition-colors" size={24} />
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Directory Config Modal - Outside canvas container */}
      {showDirConfig && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-8" onClick={() => setShowDirConfig(false)}>
          <div
            className="bg-[#f4e4bc] border-8 border-[#8b5a2b] p-8 max-w-md w-full shadow-2xl relative animate-in zoom-in duration-200"
            style={{ fontFamily: '"Press Start 2P", cursive' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowDirConfig(false)}
              className="absolute -top-6 -right-6 bg-red-900 text-white p-2 border-4 border-red-950 hover:bg-red-700 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>

            <h3 className="text-[#5d4037] text-xs uppercase tracking-tighter mb-6 flex items-center gap-3">
              <Folder size={28} />
              Working Directory
            </h3>

            <div className="mb-4">
              <label className="text-[8px] text-[#8b5a2b] mb-2 block uppercase tracking-tighter">Current Path:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={workingDirectory}
                  onChange={(e) => setWorkingDirectory(e.target.value)}
                  className="flex-1 bg-black/5 border-4 border-[#8b5a2b] px-4 py-3 text-[#4e342e] text-[10px] focus:outline-none focus:border-[#fef08a]"
                  style={{ fontFamily: '"Press Start 2P", cursive' }}
                  placeholder="Enter project path..."
                />
                <button
                  onClick={browseDirectory}
                  className="bg-[#5d4037] hover:bg-[#3e2723] text-[#f4e4bc] px-4 py-2 border-4 border-[#2d1b15] text-[8px] font-bold cursor-pointer transition-colors flex items-center gap-2"
                  title="Browse for folder"
                >
                  <Folder size={20} />
                  Browse
                </button>
              </div>
            </div>

            <div className="mb-6 bg-black/10 p-3 border-2 border-[#8b5a2b]/30">
              <div className="text-[8px] text-[#5d4037] mb-1">📍 Current directory:</div>
              <div className="text-[8px] text-[#8b5a2b] font-mono break-all">{workingDirectory}</div>
            </div>

            <div className="flex justify-between items-center">
              <button
                onClick={() => setShowDirConfig(false)}
                className="px-4 py-2 bg-[#d7ccc8] hover:bg-[#bcaaa4] text-[#4e342e] text-[10px] font-bold cursor-pointer transition-colors border-2 border-[#8d6e63]"
              >
                CANCEL
              </button>
              <button
                onClick={() => {
                  saveWorkingDirectory(workingDirectory);
                  setShowDirConfig(false);
                  // 显示保存成功提示
                  console.log('[App] Working directory saved:', workingDirectory);
                }}
                className="bg-[#8b5a2b] hover:bg-[#5d4037] text-[#f4e4bc] px-6 py-2 border-4 border-[#2d1b15] text-[10px] font-bold cursor-pointer transition-colors shadow-[0_4px_0_0_rgba(0,0,0,0.3)] hover:shadow-[0_2px_0_0_rgba(0,0,0,0.3)] hover:translate-y-[2px] active:shadow-none active:translate-y-[4px]"
              >
                SAVE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 规划模式对话框 */}
      {showPlanDialog && pendingPlan && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#f4e4bc] border-8 border-[#5d4037] shadow-2xl p-8 max-w-3xl w-full mx-4 relative">
            <button
              onClick={() => {
                setShowPlanDialog(false);
                setPendingPlan(null);
                const resolver = (window as any).__planResolver;
                if (resolver) {
                  resolver(JSON.stringify({ approved: false, reason: 'User cancelled' }));
                  delete (window as any).__planResolver;
                }
              }}
              className="absolute top-4 right-4 text-[#5d4037] hover:text-[#3e2723] transition-colors"
            >
              <X size={24} />
            </button>

            <h3 className="text-[#5d4037] text-sm uppercase tracking-tighter mb-6 flex items-center gap-3">
              <AlertTriangle size={28} />
              Task Planning Mode
            </h3>

            <div className="mb-6">
              <div className="text-[8px] text-[#8b5a2b] mb-2 uppercase tracking-tighter">
                Agent: {pendingPlan.agentId}
              </div>
              <div className="text-[#4e342e] text-sm mb-4 bg-white/30 p-4 border-2 border-[#8b5a2b]/30">
                <strong>Task:</strong> {pendingPlan.task}
              </div>
            </div>

            {pendingPlan.steps.length > 0 ? (
              <>
                <div className="mb-6">
                  <div className="text-[8px] text-[#8b5a2b] mb-3 uppercase tracking-tighter">
                    Proposed Steps:
                  </div>
                  <div className="space-y-3">
                    {pendingPlan.steps.map((step, idx) => (
                      <div key={idx} className="bg-white/20 p-4 border-2 border-[#8b5a2b]/30">
                        <div className="flex items-start gap-3">
                          <div className="bg-[#5d4037] text-[#f4e4bc] w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {idx + 1}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-bold text-[#4e342e] mb-1">{step.title}</div>
                            <div className="text-xs text-[#5d4037] mb-2">{step.description}</div>
                            <div className="text-[10px] text-[#8b5a2b]">⏱️ ~{step.estimatedTime} min</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <button
                    onClick={() => {
                      const resolver = (window as any).__planResolver;
                      if (resolver) {
                        resolver(JSON.stringify({ approved: false, reason: 'User rejected the plan' }));
                        delete (window as any).__planResolver;
                      }
                      setShowPlanDialog(false);
                      setPendingPlan(null);
                    }}
                    className="px-6 py-3 bg-[#d7ccc8] hover:bg-[#bcaaa4] text-[#4e342e] text-xs font-bold cursor-pointer transition-colors border-2 border-[#8d6e63]"
                  >
                    REJECT
                  </button>
                  <button
                    onClick={() => {
                      const resolver = (window as any).__planResolver;
                      if (resolver) {
                        resolver(JSON.stringify({
                          approved: true,
                          steps: pendingPlan.steps,
                        }));
                        delete (window as any).__planResolver;
                      }
                      setShowPlanDialog(false);
                      setPendingPlan(null);
                    }}
                    className="bg-[#8b5a2b] hover:bg-[#5d4037] text-[#f4e4bc] px-8 py-3 border-4 border-[#2d1b15] text-sm font-bold cursor-pointer transition-colors shadow-[0_4px_0_0_rgba(0,0,0,0.3)] hover:shadow-[0_2px_0_0_rgba(0,0,0,0.3)] hover:translate-y-[2px] active:shadow-none active:translate-y-[4px]"
                  >
                    ✅ APPROVE & EXECUTE
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="text-[#4e342e] text-sm mb-4">Generating plan...</div>
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#8b5a2b] border-t-transparent"></div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
