import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom';
import { IoLogOut } from "react-icons/io5";
import * as JsSIP from 'jssip'
import './App.css'

import useAuth from './hooks/useAuth';
import LoadingComponent from './components/Loading';
import { useUserInfoStore, useUserVoipStore } from './store/useStore';
import { getAsteriskUserList } from './utils/callAsteriskBackend';

// Konfigurasi SIP (pindahkan ke sini atau ke file konfigurasi)
const sipConfig = {
  uri: 'sip:1001@10.3.132.71',
  password: '21619283efe1a13cc2a93f4d3445a173',
  // Auto detect: WSS untuk production HTTPS, WS untuk localhost
  sockets: [new JsSIP.WebSocketInterface(
    window.location.protocol === 'https:' 
      ? 'wss://10.3.132.71:8089/ws'  // Production (Netlify)
      : 'ws://10.3.132.71:8088/ws'   // Development (localhost)
  )],
  realm: 'asterisk',
  register: true,
  session_timers: false,
  pcConfig: {
    iceServers: [],
    rtcpMuxPolicy: 'require',
    bundlePolicy: 'balanced'
  },
  user_agent: 'JsSIP-WebRTC-Client/1.0'
};

const ContactItem = ({ contact, onCall, onChat }) => (
  <div className="contact-item">
    <div 
      onClick={() => onChat(contact)} 
      style={{ cursor: 'pointer', flexGrow: 1 }}
    >
      <p style={{ margin: 0, fontWeight: 500 }}>{contact.name}</p>
      {contact.status && <small style={{ fontSize: '0.8em' }}>{contact.status}</small>}
    </div>
    <button 
      onClick={(e) => { e.stopPropagation(); onCall(contact.id.toString()); }} 
      className="button button-small button-primary"
      style={{ marginLeft: '10px', padding: '0.25rem 0.5rem', fontSize: '0.8em' }}
    >
      Call
    </button>
  </div>
);

const formatDuration = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

// Dashboard Statistics Component
const DashboardStats = ({ totalCalls, missedCalls, avgDuration }) => (
  <div className="dashboard-stats">
    <div className="stat-card">
      <div className="stat-number">{totalCalls.toLocaleString()}</div>
      <div className="stat-label">Total Calls</div>
      <div className="stat-icon">📞</div>
    </div>
    <div className="stat-card missed">
      <div className="stat-number">{missedCalls}</div>
      <div className="stat-label">Missed Calls</div>
      <div className="stat-icon">❌</div>
    </div>
    <div className="stat-card duration">
      <div className="stat-number">{avgDuration}</div>
      <div className="stat-label">Avg. Call Duration</div>
      <div className="stat-icon">⏱️</div>
    </div>
  </div>
);

// Active Call Section Component
const ActiveCallSection = ({ currentSession, incomingCall, onAnswer, onReject, onHangup, toggleMute, isMuted, callDuration }) => {
  const showActiveCall = currentSession && (currentSession.isInProgress() || currentSession.isEstablished()) && !currentSession.isEnded();
  const showIncomingCall = incomingCall && !incomingCall.isEnded() && !showActiveCall;
  const remoteUser = currentSession?.remote_identity?.uri?.user || incomingCall?.remote_identity?.uri?.user || 'Unknown User';

  if (showIncomingCall) {
    return (
      <div className="active-call-section">
        <h3>Incoming Call</h3>
        <div className="incoming-call-card">
          <div className="caller-info">
            <div className="caller-avatar">{remoteUser.substring(0,2).toUpperCase()}</div>
            <div className="caller-details">
              <h4>{remoteUser}</h4>
              <p>Incoming call...</p>
            </div>
          </div>
          <div className="call-actions">
            <button onClick={onAnswer} className="btn-answer">Answer</button>
            <button onClick={onReject} className="btn-reject">Decline</button>
          </div>
        </div>
      </div>
    );
  }

  if (showActiveCall) {
    return (
      <div className="active-call-section">
        <h3>Active Call</h3>
        <div className="active-call-card">
          <div className="caller-info">
            <div className="caller-avatar">{remoteUser.substring(0,2).toUpperCase()}</div>
            <div className="caller-details">
              <h4>{remoteUser}</h4>
              <p>{currentSession.isEstablished() ? formatDuration(callDuration) : 'Connecting...'}</p>
            </div>
          </div>
          <div className="call-controls">
            <button 
              onClick={toggleMute} 
              className={`btn-control ${isMuted ? 'muted' : ''}`}
              disabled={!currentSession.isEstablished()}
            >
              🎤
            </button>
            <button onClick={onHangup} className="btn-hangup">End Call</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="active-call-section">
      <h3>Active Call</h3>
      <div className="no-active-call">
        <p>No active call.</p>
      </div>
    </div>
  );
};

// Recent Activity Component
const RecentActivity = ({ callHistory = [] }) => {
  // Format relative time
  const getRelativeTime = (timestamp) => {
    if (!timestamp) return 'Unknown time';
    
    const now = new Date();
    const callTime = new Date(timestamp);
    const diffInMinutes = Math.floor((now - callTime) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hr ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  };

  // Get appropriate icon based on call type
  const getCallIcon = (call) => {
    if (call.direction === 'incoming') {
      return call.status === 'completed' ? '↓' : '↓✕';
    } else {
      return call.status === 'completed' ? '↑' : '↑✕';
    }
  };

  // Get appropriate status class
  const getCallClass = (call) => {
    if (call.status === 'missed' || call.status === 'failed') return 'missed';
    if (call.direction === 'incoming') return 'incoming';
    return 'outgoing';
  };

  // Get display text for call
  const getCallInfo = (call) => {
    if (call.status === 'completed') {
      const minutes = Math.floor(call.duration / 60);
      const seconds = call.duration % 60;
      return `${call.remote} (${minutes}:${seconds.toString().padStart(2, '0')})`;
    }
    return call.remote;
  };

  // No call history yet
  if (!callHistory || callHistory.length === 0) {
    return (
      <div className="recent-activity">
        <h3>Recent Activity</h3>
        <div className="no-activity">
          <p>No recent calls</p>
        </div>
      </div>
    );
  }

  return (
    <div className="recent-activity">
      <h3>Recent Activity</h3>
      {callHistory.slice(0, 5).map((call) => (
        <div key={call.id} className="activity-item">
          <div className={`activity-icon ${getCallClass(call)}`}>
            {getCallIcon(call)}
          </div>
          <div className="activity-details">
            <div className="activity-type">
              {call.direction === 'incoming' ? 'Incoming' : 'Outgoing'} 
              {call.status === 'missed' ? ' Missed' : call.status === 'failed' ? ' Failed' : ' Call'}
            </div>
            <div className="activity-info">{getCallInfo(call)}</div>
          </div>
          <div className="activity-time">{getRelativeTime(call.timestamp)}</div>
        </div>
      ))}
    </div>
  );
};

// Quick Contacts Component
const QuickContacts = ({ contacts, onCall, onChat }) => (
  <div className="quick-contacts">
    <h3>Quick Contacts</h3>
    {contacts.slice(0, 3).map(contact => (
      <div key={contact.id} className="contact-item">
        <div className="contact-avatar">
          {contact.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase()}
        </div>
        <div className="contact-info">
          <div className="contact-name">{contact.name}</div>
          <div className="contact-number">{contact.id}</div>
        </div>
        <button 
          onClick={() => onCall(contact.id.toString())} 
          className="btn-call-quick"
        >
          📞
        </button>
      </div>
    ))}
  </div>
);

const initContacts = [
    { id: '1001', name: 'User 1001 (Old WebRTC)', status: 'Offline' },
    { id: '1002', name: 'User 1002 (Linphone)', status: 'Online' },
    { id: '1003', name: 'User 1003 (Support)', status: 'Offline' },
    { id: '1005', name: 'Jane Smith (Tech)', status: 'Sibuk' },
  ];

function App() {
  const [ua, setUa] = useState(null);
  const [sipStatusText, setSipStatusText] = useState('Memulai...');
  const [sipStatusClass, setSipStatusClass] = useState('connecting');
  const [isRegistered, setIsRegistered] = useState(false);
  const [targetExtension, setTargetExtension] = useState('');
  const [currentSession, setCurrentSession] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeView, setActiveView] = useState('dashboard');

  const remoteAudioRef = useRef(null);
  const jssipUaInstanceRef = useRef(null);

  const [callDuration, setCallDuration] = useState(0);
  const [callTimer, setCallTimer] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatPartner, setChatPartner] = useState(null);
  const [messageQueue, setMessageQueue] = useState([]);
  const chatMessagesEndRef = useRef(null);

  const [contacts, setContacts] = useState(initContacts);

  const [isLogin] = useAuth();
  const {userInfo} = useUserInfoStore();
  const {userVoip} = useUserVoipStore();

  const [showLogout, setShowLogout] = useState(false);
  const logoutRef = useRef(null);

  useEffect(() => {
    getAsteriskUserList().then((datas) => {
      const userList = datas.filter((data) => data.resource != userVoip).map((data) => {
        return {
          id: data.resource,
          name: `User ${data.resource}`,
          status: data.state
        }
      });

      setContacts(userList)
    })
  }, [])

  // Call history tracking
  const [callHistory, setCallHistory] = useState([
    // Seed data for testing
    {
      id: 'seed-1',
      remote: '1002',
      direction: 'incoming',
      status: 'completed',
      duration: 125,
      timestamp: new Date(Date.now() - 15 * 60000), // 15 minutes ago
      cause: 'Normal call clearing'
    },
    {
      id: 'seed-2',
      remote: '1003',
      direction: 'outgoing',
      status: 'completed',
      duration: 67,
      timestamp: new Date(Date.now() - 55 * 60000), // 55 minutes ago
      cause: 'Normal call clearing'
    },
    {
      id: 'seed-3',
      remote: '1002',
      direction: 'incoming',
      status: 'missed',
      duration: 0,
      timestamp: new Date(Date.now() - 120 * 60000), // 2 hours ago
      cause: 'Rejected'
    },
    {
      id: 'seed-4',
      remote: '1005',
      direction: 'outgoing',
      status: 'failed',
      duration: 0,
      timestamp: new Date(Date.now() - 5 * 3600000), // 5 hours ago
      cause: 'User not found'
    }
  ]);
  const [callStats, setCallStats] = useState({
    totalCalls: 4,
    missedCalls: 1,
    totalDuration: 192,
    avgDuration: '1m 36s'
  });

  // Dashboard stats - initialize with seed data
  const [dashboardStats, setDashboardStats] = useState({
    totalCalls: 4,
    missedCalls: 1,
    avgDuration: '1m 36s'
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  // Process queued messages when registration is successful
  useEffect(() => {
    if (isRegistered && messageQueue.length > 0) {
      console.log(`Processing ${messageQueue.length} queued messages...`);
      messageQueue.forEach((queuedMessage, index) => {
        setTimeout(() => {
          handleSendChatMessage(queuedMessage.text, queuedMessage.partner);
        }, index * 1000); // Send with 1 second delay between messages
      });
      setMessageQueue([]); // Clear queue after processing
    }
  }, [isRegistered, messageQueue]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // NEW: Handler for selecting chat partner
  const handleSelectChatPartner = (contact) => {
    const uaInstance = ua || jssipUaInstanceRef.current;
    if (!uaInstance) {
      console.error("UA not initialized, cannot set chat partner.");
      return;
    }
    const domain = uaInstance.configuration.uri.host;
    const partnerUri = `sip:${contact.id}@${domain}`;
    console.log(`Setting chat partner: ${contact.name} (${partnerUri})`);
    setChatPartner({
      id: contact.id,
      name: contact.name,
      uri: partnerUri
    });
    setActiveView('chat');
    // Clear previous messages when switching chat partner (optional)
    // setChatMessages([]);
  };

  useEffect(() => {
    let timerIdForCleanup = null;
    const isSessionEstablished = currentSession && currentSession.isEstablished();

    // console.log(`Call Timer useEffect: Evaluating. Session ID: ${currentSession?.id}, IsEstablished: ${isSessionEstablished}, Current Timer State: ${callTimer}`);

    if (isSessionEstablished) {
      // console.log(`Call Timer useEffect: Starting timer for session ID (React state): ${currentSession.id}`);
      setCallDuration(0);
      const newTimerId = setInterval(() => {
        setCallDuration(prevDuration => prevDuration + 1);
      }, 1000);
      setCallTimer(newTimerId);
      timerIdForCleanup = newTimerId;
    } else {
      // console.log(`Call Timer useEffect: Session not established or null. currentSession ID: ${currentSession?.id}. Clearing existing timer (if any): ${callTimer}`);
      if (callTimer) {
        clearInterval(callTimer);
        setCallTimer(null);
      }
      setCallDuration(0);
    }

    return () => {
      const timerToClear = timerIdForCleanup || callTimer;
      if (timerToClear) {
        // console.log(`Call Timer useEffect: Cleanup. Clearing timerId: ${timerToClear}. Session ID at cleanup: ${currentSession?.id}, IsEstablished at cleanup: ${currentSession?.isEstablished()}`);
        clearInterval(timerToClear);
      } else {
        // console.log(`Call Timer useEffect: Cleanup. No timerId to clear. Session ID at cleanup: ${currentSession?.id}, IsEstablished at cleanup: ${currentSession?.isEstablished()}`);
      }
    };
  }, [currentSession?.id, currentSession?.isEstablished()]);

  const updateGlobalSipStatus = (text, className) => {
    setSipStatusText(text);
    setSipStatusClass(className);
  };

  const resetCallState = (logContext = "unknown context", triggeringSessionId = "N/A") => {
    console.log(`[resetCallState] Called from ${logContext}. Triggering Session ID: ${triggeringSessionId}. Current React session ID: ${currentSession?.id}`);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    setIncomingCall(null);
    setCurrentSession(null);
    console.log(`[resetCallState] After setCurrentSession(null) & setIncomingCall(null) for context: ${logContext}.`);
  };

  // Function to update call history and statistics
  const updateCallHistory = (call) => {
    // Add call to history
    setCallHistory(prev => {
      const newHistory = [call, ...prev.slice(0, 19)]; // Keep only 20 most recent calls
      
      // Calculate new statistics
      const totalCalls = newHistory.length;
      const missedCalls = newHistory.filter(c => c.status === 'missed').length;
      
      // Calculate average duration from completed calls only
      const completedCalls = newHistory.filter(c => c.status === 'completed');
      const totalDuration = completedCalls.reduce((sum, call) => sum + call.duration, 0);
      const avgDurationSeconds = completedCalls.length > 0 ? Math.round(totalDuration / completedCalls.length) : 0;
      
      // Format average duration
      const avgMinutes = Math.floor(avgDurationSeconds / 60);
      const avgSeconds = avgDurationSeconds % 60;
      const formattedAvgDuration = `${avgMinutes}m ${avgSeconds}s`;
      
      // Update stats state
      setCallStats({
        totalCalls,
        missedCalls,
        totalDuration,
        avgDuration: formattedAvgDuration
      });
      
      // Update dashboard stats
      setDashboardStats({
        totalCalls,
        missedCalls,
        avgDuration: formattedAvgDuration
      });
      
      return newHistory;
    });
  };

  const handleCall = (extension) => {
    const extToCall = extension || targetExtension;
    const uaInstance = ua || jssipUaInstanceRef.current;
    if (uaInstance && isRegistered && extToCall) {
      if (currentSession && !currentSession.isEnded()) {
        console.log(`[handleCall] Terminating existing React currentSession ${currentSession.id} before making a new call.`);
        currentSession.terminate();
      }
      if (incomingCall && !incomingCall.isEnded()) {
        console.log(`[handleCall] Terminating existing incomingCall ${incomingCall.id} before making a new call.`);
        incomingCall.terminate({ status_code: 408, reason_phrase: 'Request Timeout'});
        setIncomingCall(null);
      }

      const targetHost = uaInstance.configuration.uri.host; // Get host from UA config
      const target = `sip:${extToCall}@${targetHost}`;
      console.log(`Mencoba memanggil: ${target}`);
      const options = {
        mediaConstraints: { 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }, 
          video: false 
        },
        pcConfig: {
          iceServers: [],
          rtcpMuxPolicy: 'require',
          bundlePolicy: 'balanced'
        },
        // Add explicit SDP manipulation for better compatibility
        rtcOfferConstraints: {
          offerToReceiveAudio: true,
          offerToReceiveVideo: false
        }
        // Optional: Add eventHandlers here if you want to specifically handle events for this outgoing call
        // eventHandlers: {
        //   progress: (e) => { console.log('Outgoing call is in progress.'); },
        //   failed: (e) => { console.log(`Outgoing call failed: ${e.cause}`); },
        //   ended: (e) => { console.log('Outgoing call ended.'); },
        //   confirmed: (e) => { console.log('Outgoing call confirmed.'); }
        // }
      };
      setActiveView('dashboard');
      try {
        // The 'newRTCSession' event on the UA will handle setting this new session
        // as the currentSession for outgoing calls.
        uaInstance.call(target, options);
      } catch (e) {
        console.error("Error saat memanggil uaInstance.call:", e);
        updateGlobalSipStatus(`Error panggilan: ${e.message}`, 'failed');
      }
    } else {
      alert('Harap masukkan ekstensi tujuan dan pastikan sudah terdaftar.');
    }
  };

  const handleHangup = () => {
    console.log('[handleHangup] Clicked.');
    if (currentSession && !currentSession.isEnded()) {
      // Log session details before terminating
      console.log(`[handleHangup] Attempting to terminate React currentSession ${currentSession.id}. Session details:`, {
        id: currentSession.id,
        status_code: currentSession.status, // Numeric status code e.g., JsSIP.C.STATUS_CONFIRMED
        isEnded: currentSession.isEnded(),
        isInProgress: currentSession.isInProgress(),
        isEstablished: currentSession.isEstablished(),
        local_identity: currentSession.local_identity?.uri?.toString(),
        remote_identity: currentSession.remote_identity?.uri?.toString(),
        direction: currentSession.direction,
      });
  
      // This is the critical call that should send a BYE
      currentSession.terminate();
      console.log(`[handleHangup] currentSession.terminate() called for session ${currentSession.id}. Waiting for 'ended' event.`);
      // The UI state (currentSession to null, etc.) will be updated by the 'ended' event listener on the session.
    } else {
      console.log('[handleHangup] No active session in React state to terminate or session already ended. Current session:', currentSession);
      if (currentSession && currentSession.isEnded()) {
        console.log('[handleHangup] Session already ended, ensuring UI is reset.');
      }
      // Force UI cleanup if needed, e.g. if state is somehow inconsistent
      if (incomingCall) setIncomingCall(null); 
      resetCallState('manual hangup with no/ended session', currentSession?.id || "N/A");
      // Ensure SIP status reflects idle registered state if applicable
      const uaInstance = jssipUaInstanceRef.current;
      if (uaInstance && uaInstance.isRegistered() && !currentSession) { // Check !currentSession to avoid race if ended event is also firing
          updateGlobalSipStatus(`Terdaftar sebagai: ${uaInstance.configuration.uri.user}`, 'registered');
      }
    }
  };

  const handleAnswer = () => {
    if (incomingCall && !incomingCall.isEnded()) {
      console.log(`[handleAnswer] Answering incoming call (JsSIP ID: ${incomingCall.id})...`);
      const options = { 
        mediaConstraints: { 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }, 
          video: false 
        },
        pcConfig: {
          iceServers: [],
          rtcpMuxPolicy: 'require'
        }
      };
      incomingCall.answer(options);
      // The 'accepted' and 'confirmed' event handlers on the incomingCall session object
      // will now handle setting it as the currentSession and clearing the incomingCall state.
    } else {
        console.warn("[handleAnswer] Attempted to answer a non-existent or already ended incoming call.");
    }
  };

  const handleReject = () => {
    if (incomingCall && !incomingCall.isEnded()) {
      console.log(`[handleReject] Rejecting incoming call (JsSIP ID: ${incomingCall.id})...`);
      incomingCall.terminate({ status_code: 486, reason_phrase: 'Busy Here' }); // Or 'Decline'
      // The 'ended' or 'failed' event on the incomingCall session object will handle its cleanup.
      // We can also immediately clear the incomingCall state here for faster UI response.
      setIncomingCall(null);
      // Optionally, reset general status if not already handled by session events shortly
        const uaInstance = jssipUaInstanceRef.current;
        if (uaInstance && uaInstance.isRegistered() && !currentSession) {
            updateGlobalSipStatus(`Terdaftar sebagai: ${uaInstance.configuration.uri.user}`, 'registered');
        }
    } else {
        console.warn("[handleReject] Attempted to reject a non-existent or already ended incoming call.");
    }
  };

  const toggleMute = () => {
    if (currentSession && currentSession.isEstablished()) {
      if (isMuted) {
        currentSession.unmute({ audio: true });
        setIsMuted(false);
        console.log(`Panggilan (React currentSession ID: ${currentSession.id}) unmuted`);
      } else {
        currentSession.mute({ audio: true });
        setIsMuted(true);
        console.log(`Panggilan (React currentSession ID: ${currentSession.id}) muted`);
      }
    }
  };

  const handleSendChatMessage = (messageText = chatInput, targetUri = chatPartner?.uri) => {
    const textToSend = messageText || chatInput;
    if (textToSend.trim() === '') return;

    const uaInstance = ua || jssipUaInstanceRef.current;
    if (!uaInstance) {
      console.error("UA not available to send message.");
      return;
    }

    // Check if we're registered and connected
    if (!isRegistered || !uaInstance.isConnected()) {
      console.log("Not registered or connected, queueing message...");
      const queuedMessage = {
        text: textToSend,
        partner: targetUri,
        timestamp: new Date()
      };
      setMessageQueue(prev => [...prev, queuedMessage]);
      setChatMessages(prevMessages => [...prevMessages, {
        id: Date.now(), 
        sender: 'System', 
        text: `Message "${textToSend}" will be sent when reconnected.`, 
        timestamp: new Date()
      }]);
      setChatInput('');
      return;
    }

    // Use extension number as sender ID for consistent matching with incoming messages
    const myExtension = sipConfig.uri.match(/sip:(.*?)@/)[1];
    const newMessage = { 
      id: Date.now(), 
      sender: myExtension, 
      text: textToSend,
      timestamp: new Date() 
    };
    setChatMessages(prevMessages => [...prevMessages, newMessage]);

    if (currentSession && currentSession.isEstablished()) {
      // Send via in-call messaging
      try {
        currentSession.sendMessage(textToSend);
        console.log(`Sent in-call message: "${textToSend}" to ${currentSession.remote_identity?.uri?.user || 'remote user'}`);
      } catch (e) {
        console.error("Error sending in-call chat message:", e);
        setChatMessages(prevMessages => [...prevMessages, {
          id: Date.now(), 
          sender: 'System', 
          text: 'Failed to send in-call message.', 
          timestamp: new Date()
        }]);
      }
    } else if (targetUri && uaInstance) {
      // Send via SIP MESSAGE request
      try {
        const options = {
          'contentType': 'text/plain'
        };
        uaInstance.sendMessage(targetUri, textToSend, options);
        console.log(`Sent SIP MESSAGE: "${textToSend}" to ${targetUri}`);
      } catch (e) {
        console.error("Error sending SIP MESSAGE:", e);
        setChatMessages(prevMessages => [...prevMessages, {
          id: Date.now(), 
          sender: 'System', 
          text: `Failed to send message to ${chatPartner?.name || 'remote user'}.`, 
          timestamp: new Date()
        }]);
      }
    } else {
      console.warn("Cannot send chat message: No active call and no chat partner selected.");
      setChatMessages(prevMessages => [...prevMessages, {
        id: Date.now(), 
        sender: 'System', 
        text: 'No active call session or chat partner selected.', 
        timestamp: new Date()
      }]);
    }
    setChatInput('');
  };

  const showActiveCallUI = currentSession && (currentSession.isInProgress() || currentSession.isEstablished()) && !currentSession.isEnded();
  const showIncomingCallUI = incomingCall && !incomingCall.isEnded() && !showActiveCallUI;
  const showChatPanel = isRegistered && ( (currentSession && currentSession.isEstablished()) || chatPartner );
  const chatContextName = (currentSession && currentSession.isEstablished()) 
                            ? (currentSession.remote_identity?.uri?.user || 'Panggilan Aktif') 
                            : (chatPartner?.name || 'Pilih Kontak untuk Chat');
  const remoteUserForDisplay = currentSession?.remote_identity?.uri?.user || incomingCall?.remote_identity?.uri?.user || 'Unknown User';

  // console.log(`APP PRE-RENDER: currentSession ID: ${currentSession?.id}, isEstablished: ${currentSession?.isEstablished()?.toString()}, showActiveCallUI: ${showActiveCallUI}, incomingCall ID: ${incomingCall?.id}, showIncomingCallUI: ${showIncomingCallUI}`);

  // JsSIP initialization useEffect tetap sama
  useEffect(() => {
    JsSIP.debug.enable('JsSIP:*');
    const uaInit = new JsSIP.UA(sipConfig);
    jssipUaInstanceRef.current = uaInit;
    setUa(uaInit);

    // Enhanced connection handling with reconnection logic
    uaInit.on('connecting', () => {
      updateGlobalSipStatus('Connecting to WebSocket...', 'connecting');
      console.log('UA connecting to WebSocket...');
    });
    
    uaInit.on('connected', () => {
      updateGlobalSipStatus('Connected, attempting registration...', 'connecting');
      console.log('UA connected to WebSocket, attempting registration...');
    });
    
    uaInit.on('disconnected', (e) => {
      updateGlobalSipStatus('Disconnected from WebSocket', 'failed');
      setIsRegistered(false);
      resetCallState('UA disconnected');
      console.log('UA disconnected:', e);
      
      // Auto-reconnect logic (if not intentionally stopped)
      if (!e.code || (e.code !== 1000 && e.code !== 1001)) {
        console.log('Attempting to reconnect in 3 seconds...');
        setTimeout(() => {
          if (jssipUaInstanceRef.current && !jssipUaInstanceRef.current.isConnected()) {
            console.log('Reconnecting UA...');
            jssipUaInstanceRef.current.start();
          }
        }, 3000);
      }
    });
    
    uaInit.on('registered', () => {
      updateGlobalSipStatus(`Registered as: ${uaInit.configuration.uri.user}`, 'registered');
      setIsRegistered(true);
      console.log('UA successfully registered');
    });
    
    uaInit.on('unregistered', (e) => {
      updateGlobalSipStatus('Registration cancelled/failed', 'failed');
      setIsRegistered(false);
      console.log('UA unregistered', e);
      resetCallState('UA unregistered');
    });
    
    uaInit.on('registrationFailed', (e) => {
      updateGlobalSipStatus(`Registration Failed: ${e.cause || 'Unknown reason'}`, 'failed');
      setIsRegistered(false);
      console.error('UA registrationFailed', e);
      resetCallState('UA registrationFailed');
      
      // Retry registration after failure
      setTimeout(() => {
        if (jssipUaInstanceRef.current && jssipUaInstanceRef.current.isConnected() && !jssipUaInstanceRef.current.isRegistered()) {
          console.log('Retrying registration...');
          jssipUaInstanceRef.current.register();
        }
      }, 5000);
    });

    // Handle incoming SIP MESSAGE requests
    uaInit.on('newMessage', (e) => {
      console.log('UA received newMessage event:', e);
      
      if (e.originator === 'remote' && e.message) {
        const remoteSipUri = e.message.remote_identity?.uri;
        const senderName = remoteSipUri?.user || 'Unknown Sender';
        const senderDomain = remoteSipUri?.host || '';
        
        // Extract message body correctly from JsSIP event
        let messageText = '';
        
        if (e.request?.body) {
          messageText = e.request.body;
        }
        else if (e.message?.request?.body) {
          messageText = e.message.request.body;
        }
        else if (e.message?.body) {
          messageText = e.message.body;
        }
        else {
          console.warn('Could not extract message content from SIP MESSAGE');
        }

        console.log(`Received SIP MESSAGE from ${senderName} (${remoteSipUri?.toString()}): "${messageText}"`);

        const receivedMessage = {
          id: Date.now(),
          sender: senderName,
          text: messageText || '[Empty message]',
          timestamp: new Date()
        };
        setChatMessages(prevMessages => [...prevMessages, receivedMessage]);
        
        // Auto-select chat partner if not already chatting
        if (!chatPartner || chatPartner.id !== senderName) {
          // Find the contact matching this sender
          const matchingContact = contacts.find(c => c.id === senderName);
          if (matchingContact) {
            handleSelectChatPartner(matchingContact);
            // If we're not on the chat view, show a notification
            if (activeView !== 'chat') {
              // Auto-switch to chat view to show the new message
              setActiveView('chat');
            }
          } else {
            // If the sender is not in our contacts, create a temporary contact
            const tempContact = {
              id: senderName,
              name: `${senderName} (${senderDomain})`,
              status: 'Online'
            };
            handleSelectChatPartner(tempContact);
            // Auto-switch to chat view
            setActiveView('chat');
          }
        }
      } else {
        console.warn("Received newMessage event without remote originator or message data:", e);
      }
    });

    uaInit.on('newRTCSession', (data) => {
      const newJsSIPSessionObject = data.session;
      const remoteUser = newJsSIPSessionObject.remote_identity?.uri?.user || 'Unknown User';
      console.log(`[newRTCSession EVENT] Fired. New JsSIP Session ID: ${newJsSIPSessionObject.id}, Direction: ${newJsSIPSessionObject.direction}, Remote User: ${remoteUser}`);

      if (newJsSIPSessionObject.direction === 'incoming') {
        if (currentSession && !currentSession.isEnded()) {
          console.warn(`[newRTCSession EVENT] Incoming call ${newJsSIPSessionObject.id} from ${remoteUser} while another call ${currentSession.id} is active. Rejecting new call (Busy).`);
          newJsSIPSessionObject.terminate({ status_code: 486, reason_phrase: 'Busy Here' });
          return;
        }
        if (incomingCall && !incomingCall.isEnded()){
          console.warn(`[newRTCSession EVENT] Another incoming call ${newJsSIPSessionObject.id} from ${remoteUser} while incoming call ${incomingCall.id} is pending. Rejecting new call (Busy).`);
          newJsSIPSessionObject.terminate({ status_code: 486, reason_phrase: 'Busy Here' });
          return;
        }

        console.log(`Incoming call from: ${remoteUser} (JsSIP ID: ${newJsSIPSessionObject.id})`);
        updateGlobalSipStatus(`Incoming call from: ${remoteUser}`, 'incoming');
        setIncomingCall(newJsSIPSessionObject);
      } else { // Outgoing call
        setCurrentSession(prevCurrentSessionFromState => {
          console.log(`[newRTCSession EVENT - OUTGOING] Inside setCurrentSession. Prev React currentSession ID: ${prevCurrentSessionFromState?.id}`);
          if (prevCurrentSessionFromState && prevCurrentSessionFromState.id !== newJsSIPSessionObject.id && !prevCurrentSessionFromState.isEnded()) {
            console.warn(`[newRTCSession EVENT - OUTGOING] Terminating previous React currentSession ${prevCurrentSessionFromState.id}`);
            prevCurrentSessionFromState.terminate();
          }
          return newJsSIPSessionObject;
        });
        console.log(`Outgoing call to: ${remoteUser} (JsSIP ID: ${newJsSIPSessionObject.id})`);
        updateGlobalSipStatus(`Calling: ${remoteUser}`, 'calling');
        setIncomingCall(null);
      }

      newJsSIPSessionObject.on('progress', () => {
        const sessionRemoteUser = newJsSIPSessionObject.remote_identity?.uri?.user || 'Unknown User';
        console.log(`JsSIP Session ${newJsSIPSessionObject.id}: progress. Direction: ${newJsSIPSessionObject.direction}`);
        if (newJsSIPSessionObject.direction === 'outgoing') {
            setCurrentSession(prevSession => {
              if (prevSession && prevSession.id === newJsSIPSessionObject.id) {
                updateGlobalSipStatus(`Calling ${sessionRemoteUser}... (Ringing)`, 'calling');
              }
              return prevSession;
            });
        }
      });

      // Modified 'accepted' handler
      newJsSIPSessionObject.on('accepted', () => {
        const acceptedSession = newJsSIPSessionObject;
        const sessionRemoteUser = acceptedSession.remote_identity?.uri?.user || 'Unknown User';
        console.log(`JsSIP Session ${acceptedSession.id}: accepted. Direction: ${acceptedSession.direction}, Remote User: ${sessionRemoteUser}`);

        try {
            if (incomingCall && incomingCall.id === acceptedSession.id) {
                console.log(`Incoming call ${acceptedSession.id} from ${sessionRemoteUser} was accepted by us. Promoting to current session.`);
                updateGlobalSipStatus(`Call accepted from ${sessionRemoteUser}`, 'established');
                setCurrentSession(acceptedSession);
                setIncomingCall(null);
            } else if (currentSession && currentSession.id === acceptedSession.id) {
                console.log(`Outgoing call to ${sessionRemoteUser} (ID: ${acceptedSession.id}) was accepted by remote.`);
                updateGlobalSipStatus(`Call accepted by ${sessionRemoteUser}`, 'established');
                setCurrentSession(acceptedSession);
            } else {
                console.warn(`'accepted' event for session ${acceptedSession.id} which is not the current incomingCall (${incomingCall?.id}) nor the active currentSession (${currentSession?.id}). Attempting to set as current session.`);
                updateGlobalSipStatus(`Call with ${sessionRemoteUser} accepted`, 'established');
                setCurrentSession(acceptedSession);
                setIncomingCall(null);
            }
        } catch (error) {
            console.error("Error in 'accepted' handler:", error);
        }
      });

      // Modified 'confirmed' handler
      newJsSIPSessionObject.on('confirmed', () => {
        const confirmedSession = newJsSIPSessionObject;
        const sessionRemoteUser = confirmedSession.remote_identity?.uri?.user || 'Unknown User';
        console.log(`JsSIP Session ${confirmedSession.id}: confirmed (established). Direction: ${confirmedSession.direction}, Remote User: ${sessionRemoteUser}`);
        
        try {
            if ((incomingCall && incomingCall.id === confirmedSession.id) || (currentSession && currentSession.id === confirmedSession.id)) {
                console.log(`Session ${confirmedSession.id} with ${sessionRemoteUser} is now confirmed. Setting as current session.`);
                updateGlobalSipStatus(`Call in progress with ${sessionRemoteUser}`, 'established');
                setCurrentSession(confirmedSession);
                setIncomingCall(null);
            } else {
                console.warn(`'confirmed' event for session ${confirmedSession.id} which is not the current incomingCall (${incomingCall?.id}) nor the active currentSession (${currentSession?.id}). Attempting to set as current session if no other active.`);
                if (!currentSession || currentSession.isEnded()){ 
                    updateGlobalSipStatus(`Call with ${sessionRemoteUser} in progress`, 'established');
                    setCurrentSession(confirmedSession);
                    setIncomingCall(null);
                }
            }
        } catch (error) {
            console.error("Error in 'confirmed' handler:", error);
        }
      });

      newJsSIPSessionObject.on('ended', (e) => {
        const endedSession = newJsSIPSessionObject;
        const sessionRemoteUser = endedSession.remote_identity?.uri?.user || 'Unknown User';
        const cause = e?.cause || 'Unknown cause';
        console.log(`JsSIP Session ${endedSession.id}: ended. Cause: ${cause}. Direction: ${endedSession.direction}, Remote User: ${sessionRemoteUser}`);
        
        try {
            // Clear any state references to this session
            if (currentSession && currentSession.id === endedSession.id) {
                console.log(`Current active session ${endedSession.id} ended. Cleaning up UI state.`);
                updateGlobalSipStatus(`Call ended: ${cause}`, 'idle');
                
                // Record call in history
                if (endedSession.isEstablished() || endedSession.isInProgress()) {
                  // This was an answered call that has ended
                  updateCallHistory({
                    id: endedSession.id,
                    remote: sessionRemoteUser,
                    direction: endedSession.direction,
                    status: 'completed',
                    duration: callDuration,
                    timestamp: new Date(),
                    cause: cause
                  });
                }
                
                resetCallState(`session ended with cause "${cause}"`, endedSession.id);
            } else if (incomingCall && incomingCall.id === endedSession.id) {
                console.log(`Incoming call ${endedSession.id} ended before being answered. Cause: ${cause}. Cleaning up UI state.`);
                updateGlobalSipStatus(`Missed call from: ${sessionRemoteUser}`, 'idle');
                
                // Record missed call in history
                updateCallHistory({
                  id: endedSession.id,
                  remote: sessionRemoteUser,
                  direction: 'incoming',
                  status: 'missed',
                  duration: 0,
                  timestamp: new Date(),
                  cause: cause
                });
                
                setIncomingCall(null);
            } else {
                console.warn(`'ended' event for session ${endedSession.id} which is not the current incomingCall (${incomingCall?.id}) nor the active currentSession (${currentSession?.id}). Possible race condition or stale reference.`);
            }
        } catch (error) {
            console.error("Error in 'ended' handler:", error);
        }

        // Ensure we reset to registered state (if applicable) after hanging up
        if (jssipUaInstanceRef.current && jssipUaInstanceRef.current.isRegistered()) {
            setTimeout(() => {
                const uaRef = jssipUaInstanceRef.current;
                if (uaRef && uaRef.isRegistered()) {
                    updateGlobalSipStatus(`Registered as: ${uaRef.configuration.uri.user}`, 'registered');
                }
            }, 800); // Short delay to ensure other state updates have completed
        }
      });

      newJsSIPSessionObject.on('failed', (e) => {
        const failedSession = newJsSIPSessionObject;
        const sessionRemoteUser = failedSession.remote_identity?.uri?.user || 'Unknown User';
        const cause = e?.cause || 'Unknown cause';
        console.log(`JsSIP Session ${failedSession.id}: failed. Cause: ${cause}. Direction: ${failedSession.direction}, Remote User: ${sessionRemoteUser}`);
        
        try {
            // Show appropriate failure message based on call direction
            if (failedSession.direction === 'outgoing') {
                if (currentSession && currentSession.id === failedSession.id) {
                    updateGlobalSipStatus(`Call failed: ${cause}`, 'failed');
                    
                    // Record failed outgoing call
                    updateCallHistory({
                      id: failedSession.id,
                      remote: sessionRemoteUser,
                      direction: 'outgoing',
                      status: 'failed',
                      duration: 0,
                      timestamp: new Date(),
                      cause: cause
                    });
                    
                    resetCallState(`outgoing call failed with cause "${cause}"`, failedSession.id);
                }
            } else { // Incoming call failed
                if (incomingCall && incomingCall.id === failedSession.id) {
                    updateGlobalSipStatus(`Missed call: ${cause}`, 'idle');
                    
                    // Record missed call
                    updateCallHistory({
                      id: failedSession.id,
                      remote: sessionRemoteUser,
                      direction: 'incoming',
                      status: 'missed',
                      duration: 0,
                      timestamp: new Date(),
                      cause: cause
                    });
                    
                    setIncomingCall(null);
                }
            }
        } catch (error) {
            console.error("Error in 'failed' handler:", error);
        }
      });

      newJsSIPSessionObject.on('peerconnection', (data_pc) => {
        const peerconnection = data_pc.peerconnection;
        console.log(`JsSIP Session ${newJsSIPSessionObject.id}: peerconnection event`);
        
        // Log codec information
        peerconnection.ontrack = (event) => {
          console.log(`JsSIP Session ${newJsSIPSessionObject.id}: ontrack - remote stream received`);
          console.log('Remote stream tracks:', event.streams[0]?.getTracks());
          
          if (event.streams && event.streams[0] && remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.streams[0];
            console.log('Audio element srcObject set successfully');
          }
        };

        // Enhanced SDP logging for codec debugging
        peerconnection.addEventListener('signalingstatechange', () => {
          console.log('Signaling state:', peerconnection.signalingState);
          if (peerconnection.localDescription) {
            console.log('=== LOCAL SDP ===');
            console.log(peerconnection.localDescription.sdp);
            const audioCodecs = peerconnection.localDescription.sdp.match(/a=rtpmap:\d+ \w+\/\d+/g);
            console.log('Local Audio Codecs:', audioCodecs);
          }
          if (peerconnection.remoteDescription) {
            console.log('=== REMOTE SDP ===');
            console.log(peerconnection.remoteDescription.sdp);
            const audioCodecs = peerconnection.remoteDescription.sdp.match(/a=rtpmap:\d+ \w+\/\d+/g);
            console.log('Remote Audio Codecs:', audioCodecs);
          }
        });
      });

      newJsSIPSessionObject.on('update', (data_update) => {
        console.log(`JsSIP Session ${newJsSIPSessionObject.id}: update event`, data_update);
      });
    });

    uaInit.start();

    return () => {
      console.log('Stopping JsSIP UA...');
      const uaToStop = jssipUaInstanceRef.current;
      if (uaToStop) {
        if (uaToStop.isRegistered()) {
            uaToStop.unregister({ all: true });
        }
        console.log('Calling uaToStop.stop(). This should trigger ended/failed for active sessions.');
        uaToStop.stop();
      }
      updateGlobalSipStatus('Stopped', 'failed');
      setIsRegistered(false);
      console.log('UA stopped. Session cleanup relies on session ended/failed events triggered by ua.stop().');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClickOutside = event => {
    if (logoutRef.current && !logoutRef.current.contains(event.target)) {
      setShowLogout(false);
    }
  };

  useEffect(() => {
    if (showLogout) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showLogout]);

  function redirectLogout() {
    window.location.href = 'https://portal-saras.com/logout';
  }

  if (!isLogin) {
    return (<LoadingComponent/>);
  }

  return (
    <div className="voip-app">
      {/* Sidebar */}
      <div className="sidebar-container">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">📞</span>
            <span className="logo-text">VoIP Pro</span>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          <div 
            className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveView('dashboard')}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-text">Dashboard</span>
          </div>
          <div 
            className={`nav-item ${activeView === 'dialpad' ? 'active' : ''}`}
            onClick={() => setActiveView('dialpad')}
          >
            <span className="nav-icon">📞</span>
            <span className="nav-text">Dial Pad</span>
          </div>
          <div 
            className={`nav-item ${activeView === 'contacts' ? 'active' : ''}`}
            onClick={() => setActiveView('contacts')}
          >
            <span className="nav-icon">👥</span>
            <span className="nav-text">Contacts</span>
          </div>
          <div 
            className={`nav-item ${activeView === 'history' ? 'active' : ''}`}
            onClick={() => setActiveView('history')}
          >
            <span className="nav-icon">📋</span>
            <span className="nav-text">Call History</span>
          </div>
          <div 
            className={`nav-item ${activeView === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveView('chat')}
          >
            <span className="nav-icon">💬</span>
            <span className="nav-text">Chat</span>
          </div>
          <div 
            className={`nav-item ${activeView === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveView('settings')}
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-text">Settings</span>
          </div>
        </nav>

        <div className="sidebar-status">
          <div className={`status-indicator ${isRegistered ? 'online' : 'offline'}`}>
            <div className="status-dot"></div>
            <div className="status-text">
              <div className="status-label">Status: {isRegistered ? 'Online' : 'Offline'}</div>
              <div className="status-detail">Line 1: {isRegistered ? 'Registered' : 'Not Registered'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-container">
        <header className="main-header">
          <h1>{activeView.charAt(0).toUpperCase() + activeView.slice(1)}</h1>
          <div className="user-profile relative hover:cursor-pointer" onClick={() => setShowLogout(prev => !prev)}>
            <span className="notification-badge">2</span>
            <div className="user-avatar">{ `${userInfo?.given_name.charAt(0).toUpperCase()}${userInfo?.family_name.charAt(0).toUpperCase()}` }</div>
            <span className="user-name">{ `${userInfo?.given_name} ${userInfo?.family_name}` }</span>
            {
              showLogout && (
                <div ref={logoutRef} className='z-50 logout-div absolute right-0 top-12 flex w-32 h-12 rounded-xl'>
                  <div onClick={redirectLogout} className='flex flex-row gap-2 w-full justify-center items-center rounded-xl bg-red-500/80 hover:bg-red-400 hover:cursor-pointer'>
                    <IoLogOut className='size-6 text-white' />
                    <p className='text-white font-bold text-sm text-nowrap w-fit'>Log Out</p>
                  </div>
                </div>
              )
            }
          </div>
        </header>

        <div className="main-content">
          {activeView === 'dashboard' && (
            <div className="dashboard-view">
              <DashboardStats 
                totalCalls={dashboardStats.totalCalls}
                missedCalls={dashboardStats.missedCalls}
                avgDuration={dashboardStats.avgDuration}
              />
              
              <div className="dashboard-sections">
                <div className="dashboard-left">
                  <ActiveCallSection 
                    currentSession={currentSession}
                    incomingCall={incomingCall}
                    onAnswer={handleAnswer}
                    onReject={handleReject}
                    onHangup={handleHangup}
                    toggleMute={toggleMute}
                    isMuted={isMuted}
                    callDuration={callDuration}
                  />
                  <RecentActivity callHistory={callHistory} />
                </div>
                <div className="dashboard-right">
                  {
                    contacts[0] &&
                    <QuickContacts 
                      contacts={contacts}
                      onCall={handleCall}
                      onChat={handleSelectChatPartner}
                    />
                  }
                </div>
              </div>
            </div>
          )}

          {activeView === 'dialpad' && (
            <div className="dialpad-view">
              <div className="dial-card">
                <input
                  type="text"
                  placeholder="Enter extension (e.g. 1002)"
                  value={targetExtension}
                  onChange={(e) => setTargetExtension(e.target.value)}
                  className="dial-input"
                />
                <button onClick={() => handleCall()} className="btn-call" disabled={!isRegistered}>
                  Call
                </button>
              </div>
            </div>
          )}

          {activeView === 'contacts' && (
            <div className="contacts-view">
              <div className="contacts-list">
                {contacts.map(contact => (
                  <div key={contact.id} className="contact-card">
                    <div className="contact-avatar">
                      {contact.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase()}
                    </div>
                    <div className="contact-info">
                      <h4>{contact.name}</h4>
                      <p>{contact.status}</p>
                    </div>
                    <div className="contact-actions">
                      <button onClick={() => handleCall(contact.id.toString())} className="btn-contact-call">
                        📞
                      </button>
                      <button onClick={() => handleSelectChatPartner(contact)} className="btn-contact-chat">
                        💬
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeView === 'chat' && (
            <div className="chat-view">
              {chatPartner ? (
                <div className="chat-container">
                  <div className="chat-header">
                    <h3>Chat with: {chatPartner.name}</h3>
                  </div>
                  <div className="chat-messages">
                    {chatMessages.map(msg => {
                      // Only show messages from current chat partner or sent to them
                      const isFromCurrentPartner = msg.sender === chatPartner.id;
                      const isSentByMe = msg.sender.startsWith('Saya') || msg.sender === sipConfig.uri.match(/sip:(.*?)@/)[1];
                      
                      // If system message, or message from/to current partner, show it
                      if (msg.sender === 'System' || isFromCurrentPartner || isSentByMe) {
                        return (
                          <div 
                            key={msg.id} 
                            className={`chat-message ${isSentByMe ? 'sent' : isFromCurrentPartner ? 'received' : 'system'}`}
                          >
                            {!isSentByMe && <strong>{msg.sender}: </strong>}
                            <span>{msg.text}</span>
                            <div className="message-time">
                              {msg.timestamp && new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })}
                    <div ref={chatMessagesEndRef} />
                  </div>
                  <div className="chat-input-area">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={`Type message to ${chatPartner.name}...`}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendChatMessage()}
                      disabled={!isRegistered}
                    />
                    <button 
                      onClick={() => handleSendChatMessage()} 
                      className="btn-send"
                      disabled={!isRegistered}
                    >
                      Send
                    </button>
                  </div>
                </div>
              ) : (
                <div className="no-chat-selected">
                  <p>Select a contact to start chatting</p>
                </div>
              )}
            </div>
          )}

          {activeView === 'history' && (
            <div className="history-view">
              <div className="history-header">
                <h3>Call History</h3>
                <div className="call-stats-summary">
                  <div className="stat-pill">
                    <span className="stat-label">Total:</span>
                    <span className="stat-value">{callStats.totalCalls}</span>
                  </div>
                  <div className="stat-pill missed">
                    <span className="stat-label">Missed:</span>
                    <span className="stat-value">{callStats.missedCalls}</span>
                  </div>
                  <div className="stat-pill duration">
                    <span className="stat-label">Avg Duration:</span>
                    <span className="stat-value">{callStats.avgDuration}</span>
                  </div>
                </div>
              </div>
              
              <div className="history-list">
                {callHistory.length > 0 ? (
                  callHistory.map((call) => {
                    // Get appropriate icon and class
                    let iconClass = 'outgoing';
                    let icon = '↑';
                    
                    if (call.direction === 'incoming') {
                      iconClass = 'incoming';
                      icon = '↓';
                    }
                    
                    if (call.status === 'missed' || call.status === 'failed') {
                      iconClass = 'missed';
                      icon += '✕';
                    }
                    
                    // Format duration
                    const minutes = Math.floor(call.duration / 60);
                    const seconds = call.duration % 60;
                    const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                    
                    // Format date
                    const callDate = new Date(call.timestamp);
                    const formattedDate = callDate.toLocaleDateString();
                    const formattedTime = callDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    return (
                      <div key={call.id} className="history-item">
                        <div className={`call-icon ${iconClass}`}>{icon}</div>
                        <div className="call-details">
                          <div className="call-number">{call.remote}</div>
                          <div className="call-type">
                            {call.direction === 'incoming' ? 'Incoming' : 'Outgoing'} 
                            {call.status === 'missed' ? ' Missed' : call.status === 'failed' ? ' Failed' : ' Call'}
                          </div>
                        </div>
                        <div className="call-time">
                          <div className="call-date">{formattedDate}</div>
                          <div className="call-hour">{formattedTime}</div>
                        </div>
                        <div className="call-duration">
                          {call.status === 'completed' ? formattedDuration : call.cause}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="no-history">
                    <p>No call history available</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeView === 'settings' && (
            <div className="settings-view">
              <div className="settings-card">
                <h3>SIP Settings</h3>
                <p>Status: {sipStatusText}</p>
                <p>Extension: { userVoip }</p>
                <p>Server: 10.3.132.71:8089 (WSS)</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <audio ref={remoteAudioRef} autoPlay playsInline controls={false} />
    </div>
  );
}

export default App;