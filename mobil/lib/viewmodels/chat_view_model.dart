import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import '../models/chat_message.dart';
import '../models/chat_user.dart';
import '../services/chat_api_service.dart';
import '../services/chat_socket_service.dart';

class ChatViewModel extends ChangeNotifier {
  ChatViewModel() {
    baseUrl =
        dotenv.env['API_URL']?.replaceAll(RegExp(r'/$'), '') ??
        'http://localhost:3000';
    _apiService = ChatApiService(baseUrl: baseUrl);
    _socketService = ChatSocketService(baseUrl: baseUrl);
    _subscriptions.addAll([
      _socketService.historyStream.listen(_setHistory),
      _socketService.messageStream.listen(_addMessage),
      _socketService.updatedStream.listen(_updateMessage),
      _socketService.deletedStream.listen(_deleteMessageLocal),
      _socketService.errorStream.listen(setError),
    ]);
  }

  late final String baseUrl;
  late final ChatApiService _apiService;
  late final ChatSocketService _socketService;
  final List<StreamSubscription<dynamic>> _subscriptions = [];
  final List<ChatMessage> _messages = [];

  ChatUser? activeUser;
  bool connecting = false;
  bool sending = false;
  String error = '';

  List<ChatMessage> get messages => List.unmodifiable(_messages);
  bool get isLoggedIn => activeUser != null;

  Future<void> register(String name) async {
    final cleanName = name.trim();
    if (cleanName.isEmpty) {
      setError('Escribe tu nombre.');
      return;
    }

    connecting = true;
    error = '';
    notifyListeners();

    try {
      activeUser = await _socketService.register(cleanName);
    } catch (exception) {
      setError(_cleanException(exception));
    } finally {
      connecting = false;
      notifyListeners();
    }
  }

  Future<bool> sendMessage(String text) async {
    final cleanText = text.trim();
    if (activeUser == null || cleanText.isEmpty) {
      return false;
    }

    sending = true;
    error = '';
    notifyListeners();

    try {
      await _socketService.sendMessage(cleanText);
      return true;
    } catch (exception) {
      setError(_cleanException(exception));
      return false;
    } finally {
      sending = false;
      notifyListeners();
    }
  }

  Future<void> editMessage(ChatMessage message, String text) async {
    final user = activeUser;
    final cleanText = text.trim();

    if (user == null) {
      return;
    }

    if (cleanText.isEmpty) {
      setError('El mensaje no puede estar vacio.');
      return;
    }

    try {
      await _apiService.editMessage(
        messageId: message.id,
        userId: user.id,
        message: cleanText,
      );
      error = '';
      notifyListeners();
    } catch (exception) {
      setError(_cleanException(exception));
    }
  }

  Future<void> deleteMessage(ChatMessage message) async {
    final user = activeUser;
    if (user == null) {
      return;
    }

    try {
      await _apiService.deleteMessage(messageId: message.id, userId: user.id);
      error = '';
      notifyListeners();
    } catch (exception) {
      setError(_cleanException(exception));
    }
  }

  String mediaUrl(String path) {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    return '$baseUrl$path';
  }

  void setError(String message) {
    error = message;
    notifyListeners();
  }

  void _setHistory(List<ChatMessage> history) {
    _messages
      ..clear()
      ..addAll(history);
    notifyListeners();
  }

  void _addMessage(ChatMessage message) {
    _messages.removeWhere((item) => item.id == message.id);
    _messages.add(message);
    notifyListeners();
  }

  void _updateMessage(ChatMessage message) {
    final index = _messages.indexWhere((item) => item.id == message.id);
    if (index >= 0) {
      _messages[index] = message;
      notifyListeners();
    }
  }

  void _deleteMessageLocal(int id) {
    _messages.removeWhere((item) => item.id == id);
    notifyListeners();
  }

  String _cleanException(Object exception) {
    return exception.toString().replaceFirst('Exception: ', '');
  }

  @override
  void dispose() {
    for (final subscription in _subscriptions) {
      subscription.cancel();
    }
    _socketService.dispose();
    super.dispose();
  }
}
