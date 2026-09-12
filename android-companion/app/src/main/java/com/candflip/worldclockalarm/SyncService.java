package com.candflip.worldclockalarm;

import android.app.*;
import android.content.*;
import android.os.*;
import org.json.JSONObject;
import java.util.concurrent.Executors;
import okhttp3.*;

public class SyncService extends Service {
    static final String CHANNEL="sync"; private final Handler handler=new Handler(Looper.getMainLooper()); private WebSocket socket;
    @Override public void onCreate(){super.onCreate();createChannel();startForeground(7,notification("Связь с компьютером активна"));connect();}
    @Override public int onStartCommand(Intent i,int f,int id){connect();return START_STICKY;}
    @Override public android.os.IBinder onBind(Intent i){return null;}
    @Override public void onDestroy(){if(socket!=null)socket.close(1000,"stop");handler.removeCallbacksAndMessages(null);super.onDestroy();}
    private void createChannel(){if(Build.VERSION.SDK_INT>=26)((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel(CHANNEL,"Синхронизация",NotificationManager.IMPORTANCE_LOW));}
    private Notification notification(String text){return new Notification.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("World Clock Alarm").setContentText(text).setOngoing(true).setContentIntent(PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE)).build();}
    private synchronized void connect(){
        Store store=new Store(this); String credential=store.credential(); if(credential.isEmpty()){stopSelf();return;}
        if(socket!=null)return;
        socket=Api.HTTP.newWebSocket(Api.wsRequest(credential),new WebSocketListener(){
            @Override public void onOpen(WebSocket ws,Response r){refresh();}
            @Override public void onMessage(WebSocket ws,String text){applyMessage(text);}
            @Override public void onClosed(WebSocket ws,int code,String reason){retry();}
            @Override public void onFailure(WebSocket ws,Throwable t,Response r){retry();}
        });
    }
    private void retry(){socket=null;handler.postDelayed(this::connect,5000);}
    private void refresh(){Executors.newSingleThreadExecutor().execute(()->{try{apply(Api.status(new Store(this).credential()));flush();}catch(Exception ignored){}});}
    private void applyMessage(String text){try{JSONObject root=new JSONObject(text);if(root.has("state"))apply(root);}catch(Exception ignored){}}
    private void apply(JSONObject root){try{Store s=new Store(this);s.state(root.getJSONObject("state").toString());s.revision(root.optLong("revision",s.revision()));AlarmScheduler.reschedule(this);sendBroadcast(new Intent("com.candflip.worldclockalarm.STATE"));}catch(Exception ignored){}}
    private void flush(){
        Store s=new Store(this); org.json.JSONArray q=s.pendingActions(),left=new org.json.JSONArray();
        for(int i=0;i<q.length();i++)try{JSONObject a=q.getJSONObject(i);apply(Api.action(s.credential(),a.getString("id"),a.getString("action"),a.optInt("minutes",5)));}catch(Exception e){left.put(q.opt(i));}
        s.pendingActions(left);
    }
}
