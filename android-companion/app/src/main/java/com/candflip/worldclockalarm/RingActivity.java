package com.candflip.worldclockalarm;

import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.os.Bundle;
import android.view.*;
import android.widget.*;
import org.json.JSONObject;

public class RingActivity extends Activity {
    JSONObject reminder;
    @Override public void onCreate(Bundle b){super.onCreate(b);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON|WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED|WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);try{reminder=new JSONObject(getIntent().getStringExtra("reminder"));}catch(Exception e){reminder=new JSONObject();}build();}
    private void build(){LinearLayout root=new LinearLayout(this);root.setGravity(Gravity.CENTER);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(48,48,48,48);root.setBackgroundColor(Color.rgb(11,14,19));TextView title=new TextView(this);title.setText(reminder.optString("title","Будильник"));title.setTextColor(Color.WHITE);title.setTextSize(34);title.setGravity(Gravity.CENTER);root.addView(title,new LinearLayout.LayoutParams(-1,0,1));Button done=button("Готово");Button five=button("+5 минут");Button fifteen=button("+15 минут");root.addView(done);root.addView(five);root.addView(fifteen);done.setOnClickListener(v->act("done",0));five.setOnClickListener(v->act("snooze",5));fifteen.setOnClickListener(v->act("snooze",15));setContentView(root);}
    private Button button(String s){Button b=new Button(this);b.setText(s);b.setTextSize(20);b.setAllCaps(false);b.setLayoutParams(new LinearLayout.LayoutParams(-1,96));return b;}
    private void act(String action,int minutes){Intent i=new Intent(this,ActionReceiver.class).setAction(action).putExtra("id",reminder.optString("id")).putExtra("minutes",minutes).putExtra("reminder",reminder.toString());sendBroadcast(i);finishAndRemoveTask();}
}
