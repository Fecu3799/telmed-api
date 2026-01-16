import {
  RoomAudioRenderer,
  ControlBar,
  VideoTrack,
  useTracks,
  type TrackReference,
} from '@livekit/components-react';
import { Track } from 'livekit-client';

/**
 * RoomLayout: All components that require LiveKit room context.
 * This component MUST be rendered inside <LiveKitRoom>.
 */
type RoomLayoutProps = {
  activeRole: 'doctor' | 'patient' | null;
  onCloseConsultation?: () => void;
  closing?: boolean;
};

export function RoomLayout({
  activeRole,
  onCloseConsultation,
  closing = false,
}: RoomLayoutProps) {
  // Get all camera tracks (remote and local)
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );

  // Filter out placeholders (only tracks with valid publication)
  // and separate local and remote tracks
  const validTracks = tracks.filter(
    (trackRef) =>
      'publication' in trackRef &&
      trackRef.publication !== undefined &&
      trackRef.publication.track !== undefined,
  ) as TrackReference[];

  const localTrack = validTracks.find(
    (trackRef) => trackRef.participant?.isLocal === true,
  );
  const remoteTrack = validTracks.find(
    (trackRef) => trackRef.participant?.isLocal !== true,
  );

  // Debug logs (only in dev)
  if (import.meta.env.DEV) {
    console.log('[RoomLayout] Tracks status', {
      totalTracks: tracks.length,
      validTracks: validTracks.length,
      hasLocalTrack: !!localTrack,
      hasRemoteTrack: !!remoteTrack,
      localTrackParticipant: localTrack?.participant?.identity,
      remoteTrackParticipant: remoteTrack?.participant?.identity,
    });
  }

  return (
    <div
      className="room-layout-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(520px, 1fr) 380px',
        gridTemplateRows: '1fr 96px',
        gridTemplateAreas: `
          "video side"
          "bottom bottom"
        `,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Video area: main stage with remote video + local PiP */}
      <div
        className="room-video-area"
        style={{
          gridArea: 'video',
          position: 'relative',
          backgroundColor: '#171717',
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
        }}
      >
        {/* Main stage: Remote video (fills container, aligned top-left) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
          }}
        >
          {remoteTrack ? (
            <VideoTrack
              trackRef={remoteTrack}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: '0',
              }}
            />
          ) : (
            <div
              style={{
                color: '#fff',
                fontSize: '18px',
                textAlign: 'center',
                width: '100%',
                paddingTop: '40px',
              }}
            >
              Waiting for remote participant...
            </div>
          )}
        </div>

        {/* Picture-in-Picture: Local video overlay (small, top-right within video area) */}
        {localTrack && (
          <div
            className="local-video-pip"
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '224px',
              height: '160px',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              zIndex: 10,
            }}
          >
            <VideoTrack
              trackRef={localTrack}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </div>
        )}
      </div>

      {/* Side panel: Clinical data (placeholder) */}
      <div
        className="room-side-panel"
        style={{
          gridArea: 'side',
          backgroundColor: '#ffffff',
          borderLeft: '1px solid #e5e5e5',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Patient Summary Section */}
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid #e5e5e5',
          }}
        >
          <h3
            style={{
              margin: '0 0 12px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#171717',
            }}
          >
            Patient Summary
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '16px', color: '#404040' }}>
              <strong>Name:</strong> [Patient Name Placeholder]
            </div>
            <div style={{ fontSize: '14px', color: '#737373' }}>
              <strong>Age:</strong> [Age Placeholder]
            </div>
            <div
              style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                marginTop: '8px',
              }}
            >
              <span
                style={{
                  padding: '4px 12px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#404040',
                }}
              >
                Tag 1
              </span>
              <span
                style={{
                  padding: '4px 12px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#404040',
                }}
              >
                Tag 2
              </span>
            </div>
          </div>
        </div>

        {/* Notes / HCE Section (doctor only) */}
        {activeRole === 'doctor' && (
          <div
            style={{
              padding: '20px',
              borderBottom: '1px solid #e5e5e5',
              flex: 1,
            }}
          >
            <h3
              style={{
                margin: '0 0 12px 0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#171717',
              }}
            >
              Notes / HCE
            </h3>
            <textarea
              placeholder="Enter clinical notes here..."
              style={{
                width: '100%',
                minHeight: '200px',
                padding: '12px',
                border: '1px solid #d4d4d4',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>
        )}

        {/* Actions Section */}
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid #e5e5e5',
          }}
        >
          <h3
            style={{
              margin: '0 0 12px 0',
              fontSize: '18px',
              fontWeight: '600',
              color: '#171717',
            }}
          >
            Actions
          </h3>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {activeRole === 'doctor' && onCloseConsultation && (
              <button
                onClick={onCloseConsultation}
                disabled={closing}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  zIndex: 50,
                  padding: '10px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: closing ? '#888' : '#dc2626',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: closing ? 'not-allowed' : 'pointer',
                }}
              >
                {closing ? 'Finalizando...' : 'Terminar consulta'}
              </button>
            )}
            <button
              style={{
                padding: '10px 16px',
                border: '1px solid #d4d4d4',
                borderRadius: '6px',
                backgroundColor: 'white',
                color: '#404040',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Extend Time
            </button>
            <button
              style={{
                padding: '10px 16px',
                border: '1px solid #d4d4d4',
                borderRadius: '6px',
                backgroundColor: 'white',
                color: '#404040',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Flag Issue
            </button>
          </div>
        </div>
      </div>

      {/* Bottom bar: Status + ControlBar + Consultation info */}
      <div
        className="room-bottom-bar"
        style={{
          gridArea: 'bottom',
          borderTop: '1px solid #404040',
          backgroundColor: '#0a0a0a',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '16px',
        }}
      >
        {/* Left: Connection status + IDs */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            minWidth: '200px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#22c55e',
              }}
            />
            <span>Connected</span>
          </div>
          <div style={{ fontSize: '12px', color: '#a3a3a3' }}>
            Room: [Room Name]
          </div>
        </div>

        {/* Center: ControlBar */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div style={{ maxWidth: '600px', width: '100%' }}>
            <ControlBar />
          </div>
        </div>

        {/* Right: Consultation status / timers placeholder */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            minWidth: '150px',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: '500' }}>
            Status: in_progress
          </div>
          <div style={{ fontSize: '12px', color: '#a3a3a3' }}>
            Duration: [Timer placeholder]
          </div>
        </div>
      </div>

      {/* Audio renderer (hidden, but required for audio) */}
      <RoomAudioRenderer />
    </div>
  );
}
