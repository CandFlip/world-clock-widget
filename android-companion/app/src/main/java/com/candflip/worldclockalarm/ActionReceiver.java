package com.candflip.worldclockalarm;

import android.content.*;
import org.json.*;
import java.util.concurrent.Executors;

public class ActionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c,Intent i){
        c.stopService(new Intent(c,AlarmSoundService.class));String id=i.getStringExtra("id"),action=i.getAction();int minutes=i.getIntExtra("minutes",5);Store store=new Store(c);
        updateLocal(c,store,id,action,minutes,i.getStringExtra("reminder"));
        final PendingResult pending=goAsync();Executors.newSingleThreadExecutor().execute(()->{try{JSONObject response=Api.action(store.credential(),id,action,minutes);if(response.has("state")){store.state(response.getJSONObject("state").toString());store.revision(response.optLong("revision",store.revision()));AlarmScheduler.reschedule(c);}}catch(Exception e){JSONArray q=store.pendingActions();q.put(new JSONObject().put("id",id).put("action",action).put("minutes",minutes));store.pendingActions(q);}finally{pending.finish();}});
    }
    private void updateLocal(Context c,Store store,String id,String action,int minutes,String raw){
        try{JSONObject state=new JSONObject(store.state());JSONArray list=state.optJSONArray("reminders"),next=new JSONArray();if(list!=null)for(int n=0;n<list.length();n++){JSONObject r=list.getJSONObject(n);if(!id.equals(r.optString("id"))){next.put(r);continue;}if("snooze".equals(action)){long at=System.currentTimeMillis()+minutes*60000L;r.put("alarm",at/1000.0).put("target",at/1000.0).put("state","pending").put("active",true);next.put(r);}}state.put("reminders",next);store.state(state.toString());AlarmScheduler.reschedule(c);}catch(Exception ignored){}
    }
}
