package com.candflip.worldclockalarm;

import android.content.*;

public class AlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c,Intent i){
        Intent service=new Intent(c,AlarmSoundService.class).putExtra("reminder",i.getStringExtra("reminder"));
        if(android.os.Build.VERSION.SDK_INT>=26)c.startForegroundService(service);else c.startService(service);
    }
}
