package com.candflip.worldclockalarm;

import android.content.*;

public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c,Intent i){AlarmScheduler.reschedule(c);if(!new Store(c).credential().isEmpty()){Intent service=new Intent(c,SyncService.class);if(android.os.Build.VERSION.SDK_INT>=26)c.startForegroundService(service);else c.startService(service);}}
}
