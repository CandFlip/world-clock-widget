package com.candflip.worldclockalarm;

import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.media.*;
import android.net.Uri;
import android.os.*;
import org.json.JSONObject;

public class AlarmSoundService extends Service {
    static final String CHANNEL="alarms"; MediaPlayer player; Vibrator vibrator;
    @Override public int onStartCommand(Intent i,int f,int id){String raw=i==null?null:i.getStringExtra("reminder");if(raw==null){stopSelf();return START_NOT_STICKY;}try{JSONObject r=new JSONObject(raw);startForeground(42,notification(r));ring();}catch(Exception e){stopSelf();}return START_NOT_STICKY;}
    @Override public android.os.IBinder onBind(Intent i){return null;}
    private PendingIntent action(String action,JSONObject r,int minutes){Intent i=new Intent(this,ActionReceiver.class).setAction(action).putExtra("id",r.optString("id")).putExtra("minutes",minutes).putExtra("reminder",r.toString());return PendingIntent.getBroadcast(this,(r.optString("id")+action+minutes).hashCode(),i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private Notification notification(JSONObject r){
        NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);if(Build.VERSION.SDK_INT>=26){NotificationChannel ch=new NotificationChannel(CHANNEL,"Будильники",NotificationManager.IMPORTANCE_HIGH);ch.setSound(null,null);ch.enableVibration(true);ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);nm.createNotificationChannel(ch);}
        Intent full=new Intent(this,RingActivity.class).putExtra("reminder",r.toString()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return new Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setColor(Color.rgb(124,77,255)).setContentTitle(r.optString("title","Будильник")).setContentText("Время пришло").setCategory(Notification.CATEGORY_ALARM).setVisibility(Notification.VISIBILITY_PUBLIC).setOngoing(true).setFullScreenIntent(PendingIntent.getActivity(this,r.optString("id").hashCode(),full,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE),true).addAction(new Notification.Action.Builder(0,"Готово",action("done",r,0)).build()).addAction(new Notification.Action.Builder(0,"+5 минут",action("snooze",r,5)).build()).build();
    }
    private void ring(){try{Uri uri=RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);if(uri==null)uri=RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);player=new MediaPlayer();player.setDataSource(this,uri);player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());player.setLooping(true);player.prepare();player.start();}catch(Exception ignored){}
        vibrator=(Vibrator)getSystemService(VIBRATOR_SERVICE);if(vibrator!=null){long[] pattern={0,700,350,700,600};if(Build.VERSION.SDK_INT>=26)vibrator.vibrate(VibrationEffect.createWaveform(pattern,0));else vibrator.vibrate(pattern,0);}}
    @Override public void onDestroy(){if(player!=null){player.stop();player.release();}if(vibrator!=null)vibrator.cancel();((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).cancel(42);super.onDestroy();}
}
