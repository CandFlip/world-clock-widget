package com.candflip.worldclockalarm;

import android.app.*;
import android.content.*;
import android.os.Build;
import org.json.*;
import java.util.HashSet;
import java.util.Set;

final class AlarmScheduler {
    static void reschedule(Context c){
        Store store=new Store(c); Set<Integer> old=c.getSharedPreferences("scheduled",0).getStringSet("ids",new HashSet<>() ).stream().map(Integer::valueOf).collect(java.util.stream.Collectors.toSet());
        for(int id:old) cancel(c,id); Set<String> next=new HashSet<>();
        try { JSONArray list=new JSONObject(store.state()).optJSONArray("reminders"); if(list==null)return;
            long now=System.currentTimeMillis();
            for(int i=0;i<list.length();i++){ JSONObject item=list.getJSONObject(i); if(!"pending".equals(item.optString("state","pending"))||!item.optBoolean("active",true))continue;
                long at=(long)(item.optDouble("alarm",item.optDouble("target",0))*1000); if(at<=now) continue;
                int code=item.optString("id").hashCode(); schedule(c,code,at,item.toString()); next.add(String.valueOf(code)); }
        } catch(Exception ignored){}
        c.getSharedPreferences("scheduled",0).edit().putStringSet("ids",next).apply();
    }
    static void schedule(Context c,int code,long at,String reminder){
        AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
        Intent intent=new Intent(c,AlarmReceiver.class).putExtra("reminder",reminder);
        PendingIntent pi=PendingIntent.getBroadcast(c,code,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        if(Build.VERSION.SDK_INT<31||am.canScheduleExactAlarms()) am.setAlarmClock(new AlarmManager.AlarmClockInfo(at,pi),pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi);
    }
    private static void cancel(Context c,int code){
        PendingIntent pi=PendingIntent.getBroadcast(c,code,new Intent(c,AlarmReceiver.class),PendingIntent.FLAG_NO_CREATE|PendingIntent.FLAG_IMMUTABLE);
        if(pi!=null)((AlarmManager)c.getSystemService(Context.ALARM_SERVICE)).cancel(pi);
    }
}
