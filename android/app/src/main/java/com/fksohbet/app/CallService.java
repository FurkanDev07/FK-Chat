package com.fksohbet.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/* JADX INFO: loaded from: classes.dex */
public class CallService extends Service {
    static final String ACTION_START = "com.fksohbet.app.CALL_START";
    static final String ACTION_STOP = "com.fksohbet.app.CALL_STOP";
    static final String CHANNEL = "fksohbet_call";
    static final int NOTIF_ID = 2001;
    private AudioManager audio;
    private AudioManager.OnAudioFocusChangeListener focusListener;
    private AudioFocusRequest focusRequest;
    private PowerManager.WakeLock wake;

    @Override // android.app.Service
    public void onCreate() {
        super.onCreate();
        createChannel();
        try {
            PowerManager powerManager = (PowerManager) getSystemService("power");
            if (powerManager != null) {
                PowerManager.WakeLock wakeLockNewWakeLock = powerManager.newWakeLock(1, "FKSohbet::Call");
                this.wake = wakeLockNewWakeLock;
                wakeLockNewWakeLock.setReferenceCounted(false);
            }
        } catch (Exception e) {
        }
        this.audio = (AudioManager) getSystemService("audio");
    }

    @Override // android.app.Service
    public int onStartCommand(Intent intent, int r2, int r3) {
        if (ACTION_STOP.equals(intent == null ? ACTION_START : intent.getAction())) {
            stopCall();
            return 2;
        }
        startCall();
        return 1;
    }

    // Reconstructed from the instruction listing retained by JADX in the recovered source.
    private void startCall() {
        Notification notification = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= 30) startForeground(NOTIF_ID, notification, 130);
            else startForeground(NOTIF_ID, notification);
        } catch (Exception firstFailure) {
            try { startForeground(NOTIF_ID, notification); } catch (Exception ignored) { }
        }
        try {
            if (wake != null && !wake.isHeld()) wake.acquire();
        } catch (Exception ignored) { }
        routeAudio(true);
    }

    private void stopCall() {
        routeAudio(false);
        try {
            PowerManager.WakeLock wakeLock = this.wake;
            if (wakeLock != null && wakeLock.isHeld()) {
                this.wake.release();
            }
        } catch (Exception e) {
        }
        try {
            stopForeground(true);
        } catch (Exception e2) {
        }
        stopSelf();
    }

    private void routeAudio(boolean z) {
        AudioFocusRequest audioFocusRequest;
        AudioManager audioManager = this.audio;
        if (audioManager == null) {
            return;
        }
        try {
            if (z) {
                this.focusListener = new AudioManager.OnAudioFocusChangeListener() { // from class: com.fksohbet.app.CallService$$ExternalSyntheticLambda0
                    @Override // android.media.AudioManager.OnAudioFocusChangeListener
                    public final void onAudioFocusChange(int r1) {
                        CallService.lambda$routeAudio$0(r1);
                    }
                };
                if (Build.VERSION.SDK_INT >= 26) {
                    AudioFocusRequest audioFocusRequestBuild = new AudioFocusRequest.Builder(2).setAudioAttributes(new AudioAttributes.Builder().setUsage(2).setContentType(1).build()).setAcceptsDelayedFocusGain(false).setOnAudioFocusChangeListener(this.focusListener).build();
                    this.focusRequest = audioFocusRequestBuild;
                    this.audio.requestAudioFocus(audioFocusRequestBuild);
                }
                this.audio.setMode(3);
                this.audio.setSpeakerphoneOn(true);
                return;
            }
            audioManager.setSpeakerphoneOn(false);
            this.audio.setMode(0);
            if (Build.VERSION.SDK_INT >= 26 && (audioFocusRequest = this.focusRequest) != null) {
                this.audio.abandonAudioFocusRequest(audioFocusRequest);
            }
            this.focusRequest = null;
        } catch (Exception e) {
        }
    }

    static /* synthetic */ void lambda$routeAudio$0(int r0) {
    }

    private Notification buildNotification() {
        Notification.Builder builder;
        Intent intent = new Intent(this, (Class<?>) MainActivity.class);
        intent.setFlags(805306368);
        PendingIntent activity = PendingIntent.getActivity(this, 0, intent, 201326592);
        if (Build.VERSION.SDK_INT >= 26) {
            builder = new Notification.Builder(this, CHANNEL);
        } else {
            builder = new Notification.Builder(this);
        }
        builder.setContentTitle("FK Sohbet").setContentText("Görüşme sürüyor").setSmallIcon(R.drawable.ic_stat).setContentIntent(activity).setOngoing(true).setShowWhen(false).setOnlyAlertOnce(true);
        return builder.build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) {
            return;
        }
        try {
            NotificationManager notificationManager = (NotificationManager) getSystemService("notification");
            if (notificationManager == null) {
                return;
            }
            NotificationChannel notificationChannel = new NotificationChannel(CHANNEL, "Görüşme", 2);
            notificationChannel.setDescription("Görüşme sürerken gösterilir");
            notificationChannel.setShowBadge(false);
            notificationChannel.setSound(null, null);
            notificationManager.createNotificationChannel(notificationChannel);
        } catch (Exception e) {
        }
    }

    @Override // android.app.Service
    public void onDestroy() {
        routeAudio(false);
        try {
            PowerManager.WakeLock wakeLock = this.wake;
            if (wakeLock != null && wakeLock.isHeld()) {
                this.wake.release();
            }
        } catch (Exception e) {
        }
        super.onDestroy();
    }

    @Override // android.app.Service
    public IBinder onBind(Intent intent) {
        return null;
    }
}
