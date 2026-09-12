package com.candflip.worldclockalarm;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.graphics.Color;
import android.view.*;
import android.widget.*;
import com.google.android.gms.mlkit.vision.codescanner.*;
import com.google.mlkit.vision.barcode.common.Barcode;
import org.json.JSONObject;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    TextView status; Button scan,permissions,disconnect; Store store;
    final BroadcastReceiver receiver=new BroadcastReceiver(){public void onReceive(Context c,Intent i){render();}};
    @Override public void onCreate(Bundle b){super.onCreate(b);store=new Store(this);build();handle(getIntent());requestNotification();render();}
    @Override protected void onNewIntent(Intent i){super.onNewIntent(i);handle(i);}
    @Override protected void onResume(){super.onResume();render();if(!store.credential().isEmpty())ContextCompatStart();}
    @Override protected void onStart(){super.onStart();registerReceiver(receiver,new IntentFilter("com.candflip.worldclockalarm.STATE"),Build.VERSION.SDK_INT>=33?RECEIVER_NOT_EXPORTED:0);}
    @Override protected void onStop(){unregisterReceiver(receiver);super.onStop();}
    private TextView text(String s,int size){TextView v=new TextView(this);v.setText(s);v.setTextColor(Color.WHITE);v.setTextSize(size);v.setPadding(0,12,0,12);return v;}
    private Button button(String s){Button b=new Button(this);b.setText(s);b.setTextSize(16);b.setAllCaps(false);b.setPadding(12,12,12,12);return b;}
    private void build(){
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(48,64,48,48);root.setBackgroundColor(Color.rgb(11,14,19));
        root.addView(text("World Clock Alarm",26));root.addView(text("Будильники с компьютера звонят на этом телефоне.",16));
        status=text("",17);root.addView(status);scan=button("Сканировать QR с компьютера");root.addView(scan);scan.setOnClickListener(v->scan());
        permissions=button("Разрешить точные будильники");root.addView(permissions);permissions.setOnClickListener(v->openAlarmPermission());
        disconnect=button("Отключить телефон");root.addView(disconnect);disconnect.setOnClickListener(v->disconnect());setContentView(root);
    }
    private void render(){boolean linked=!store.credential().isEmpty();status.setText(linked?"Подключено"+(store.connectedName().isEmpty()?"":" к "+store.connectedName()):"Не подключено");scan.setVisibility(linked?View.GONE:View.VISIBLE);disconnect.setVisibility(linked?View.VISIBLE:View.GONE);
        AlarmManager am=(AlarmManager)getSystemService(ALARM_SERVICE);boolean exact=Build.VERSION.SDK_INT<31||am.canScheduleExactAlarms();permissions.setVisibility(exact?View.GONE:View.VISIBLE);}
    private void scan(){GmsBarcodeScannerOptions options=new GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).enableAutoZoom().build();GmsBarcodeScanning.getClient(this,options).startScan().addOnSuccessListener(code->pairFrom(code.getRawValue())).addOnFailureListener(e->toast("Не удалось считать QR"));}
    private void handle(Intent i){if(i!=null&&Intent.ACTION_VIEW.equals(i.getAction()))pairFrom(i.getDataString());}
    private void pairFrom(String value){if(value==null)return;Uri u=Uri.parse(value);String token=u.getQueryParameter("token");if(token==null||token.isEmpty()){toast("Это не QR World Clock");return;}status.setText("Подключение…");Executors.newSingleThreadExecutor().execute(()->{try{JSONObject r=Api.pair(token);store.credential(r.getString("device_credential"));store.state(r.getJSONObject("state").toString());store.revision(r.optLong("revision",0));store.connectedName("Windows");AlarmScheduler.reschedule(this);runOnUiThread(()->{render();ContextCompatStart();toast("Телефон подключён");});}catch(Exception e){runOnUiThread(()->toast("Не удалось подключиться. Обновите QR на компьютере."));}});}
    private void disconnect(){String c=store.credential();store.clear();stopService(new Intent(this,SyncService.class));render();Executors.newSingleThreadExecutor().execute(()->{try{Api.disconnect(c);}catch(Exception ignored){}});}
    private void ContextCompatStart(){Intent i=new Intent(this,SyncService.class);if(Build.VERSION.SDK_INT>=26)startForegroundService(i);else startService(i);}
    private void requestNotification(){if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=getPackageManager().PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},11);}
    private void openAlarmPermission(){if(Build.VERSION.SDK_INT>=31)startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));}
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_LONG).show();}
}
